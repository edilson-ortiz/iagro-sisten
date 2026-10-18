-- =====================================================================
-- 0015 · Registro por WhatsApp, invitaciones y "solo lluvias fuertes"
-- (prototipo docs/prototipos/registro-por-whatsapp.html)
-- - Quien no está registrado y toca "Pronóstico 7 días" / "¿A qué hora llueve?"
--   se registra en el mismo chat: ubicación 📎, ciudad escrita o lista
--   departamento → ciudad. bot_clima.registro_chat guarda en qué paso va.
-- - Cada cliente tiene un código de invitación: N amigos registrados = días gratis.
-- - "Dejar de recibir" ofrece quedarse con "Solo lluvias fuertes"; "ALTA" vuelve a todo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Configuración (editable en el panel)
-- ---------------------------------------------------------------------
INSERT INTO bot_clima.configuracion (clave, valor, tipo, grupo, etiqueta, descripcion, orden) VALUES
('lluvia_fuerte_mm', '20', 'numero', 'lluvia', 'Lluvia fuerte (mm)',
 'Quien eligió "Solo lluvias fuertes" recibe la alerta solo si se esperan al menos estos milímetros.', 32),
('referidos_meta', '5', 'numero', 'suscripcion', 'Amigos para ganar el premio',
 'Cantidad de amigos invitados que deben registrar su lote para ganar el premio.', 14),
('referidos_premio_dias', '30', 'numero', 'suscripcion', 'Días de premio por invitar',
 'Días gratis que gana el cliente cada vez que completa la meta de amigos invitados.', 15),
('whatsapp_numero', '"59176762207"', 'texto', 'whatsapp', 'Número de WhatsApp del bot',
 'Con código de país, sin +. Se usa en el enlace de invitación (wa.me).', 39)
ON CONFLICT (clave) DO NOTHING;

-- ---------------------------------------------------------------------
-- Columnas del cliente
-- ---------------------------------------------------------------------
ALTER TABLE bot_clima.usuarios ADD COLUMN IF NOT EXISTS alertas_nivel varchar(8) NOT NULL DEFAULT 'todas'
  CHECK (alertas_nivel IN ('todas', 'fuertes'));
ALTER TABLE bot_clima.usuarios ADD COLUMN IF NOT EXISTS codigo_referido varchar(8) UNIQUE;
ALTER TABLE bot_clima.usuarios ADD COLUMN IF NOT EXISTS referido_por bigint REFERENCES bot_clima.usuarios(id) ON DELETE SET NULL;
ALTER TABLE bot_clima.usuarios ADD COLUMN IF NOT EXISTS referidos_premiados integer NOT NULL DEFAULT 0;
COMMENT ON COLUMN bot_clima.usuarios.codigo_referido IS 'Código para invitar amigos (va en el enlace wa.me)';
COMMENT ON COLUMN bot_clima.usuarios.referidos_premiados IS 'Cuántas veces ya ganó el premio por invitar';

-- Código de 4 caracteres fáciles de leer (sin 0/O ni 1/I)
CREATE OR REPLACE FUNCTION bot_clima.nuevo_codigo_referido() RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_letras text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_codigo text;
BEGIN
  LOOP
    v_codigo := '';
    FOR i IN 1..4 LOOP
      v_codigo := v_codigo || substr(v_letras, 1 + floor(random() * length(v_letras))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM bot_clima.usuarios WHERE codigo_referido = v_codigo);
  END LOOP;
  RETURN v_codigo;
END $$;

CREATE OR REPLACE FUNCTION bot_clima.asignar_codigo_referido() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.codigo_referido IS NULL THEN
    NEW.codigo_referido := bot_clima.nuevo_codigo_referido();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_usuarios_codigo_referido ON bot_clima.usuarios;
CREATE TRIGGER trg_usuarios_codigo_referido BEFORE INSERT ON bot_clima.usuarios
  FOR EACH ROW EXECUTE FUNCTION bot_clima.asignar_codigo_referido();

UPDATE bot_clima.usuarios SET codigo_referido = bot_clima.nuevo_codigo_referido() WHERE codigo_referido IS NULL;

-- ---------------------------------------------------------------------
-- En qué paso del registro por chat va cada teléfono (vence a las 24 h)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bot_clima.registro_chat (
  telefono        varchar(20)  PRIMARY KEY,
  estado          varchar(25)  NOT NULL
                  CHECK (estado IN ('ESPERANDO_UBICACION', 'ESPERANDO_DEPARTAMENTO', 'ESPERANDO_CIUDAD', 'ELEGIR_LUGAR')),
  pedido          varchar(10)  NOT NULL DEFAULT 'fc' CHECK (pedido IN ('fc', 'hora')),  -- qué pidió: pronóstico o hora de lluvia
  departamento    varchar(40),
  opciones        jsonb,                                  -- lugares encontrados cuando hay más de uno
  codigo_invitado varchar(8),                             -- código de quien lo invitó (si llegó por invitación)
  actualizado_el  timestamptz  NOT NULL DEFAULT now()
);
COMMENT ON TABLE bot_clima.registro_chat IS 'Registro por WhatsApp en curso (lo usa el bot de n8n).';

CREATE OR REPLACE FUNCTION bot_clima.registro_chat_guardar(
  p_telefono text, p_estado text, p_pedido text DEFAULT NULL, p_departamento text DEFAULT NULL,
  p_opciones jsonb DEFAULT NULL, p_codigo_invitado text DEFAULT NULL
) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO bot_clima.registro_chat AS r (telefono, estado, pedido, departamento, opciones, codigo_invitado, actualizado_el)
  VALUES (regexp_replace(p_telefono, '[^0-9]', '', 'g'), p_estado, COALESCE(p_pedido, 'fc'), p_departamento, p_opciones,
          upper(NULLIF(p_codigo_invitado, '')), now())
  ON CONFLICT (telefono) DO UPDATE
     SET estado = EXCLUDED.estado,
         pedido = COALESCE(p_pedido, r.pedido),
         departamento = EXCLUDED.departamento,
         opciones = EXCLUDED.opciones,
         codigo_invitado = COALESCE(EXCLUDED.codigo_invitado, r.codigo_invitado),
         actualizado_el = now()
$$;

-- ---------------------------------------------------------------------
-- Alta desde el chat: registra, aplica la invitación y borra el paso en curso
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION bot_clima.registrar_desde_chat(
  p_telefono text, p_nombre text, p_latitud double precision, p_longitud double precision,
  p_zona text, p_origen text, p_chatwoot_contact_id bigint DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_tel      text := regexp_replace(p_telefono, '[^0-9]', '', 'g');
  v_reg      record;
  v_codigo   text;
  v_padrino  bigint;
  v_meta     integer := GREATEST(bot_clima.cfg_num('referidos_meta', 5)::int, 1);
  v_premio   integer := bot_clima.cfg_num('referidos_premio_dias', 30)::int;
  v_cuenta   integer;
  v_u        bot_clima.usuarios;
BEGIN
  SELECT codigo_invitado INTO v_codigo FROM bot_clima.registro_chat WHERE telefono = v_tel;
  SELECT * INTO v_reg FROM bot_clima.registrar_usuario(v_tel, p_nombre, p_latitud, p_longitud, p_zona, p_origen, p_chatwoot_contact_id);

  -- Ubicación nueva para un cliente que ya existía: se actualiza y se nombra la zona
  IF NOT v_reg.es_nuevo THEN
    UPDATE bot_clima.usuarios
       SET latitud = COALESCE(p_latitud, latitud), longitud = COALESCE(p_longitud, longitud),
           zona = COALESCE(NULLIF(trim(p_zona), ''), zona), ubicacion_origen = COALESCE(p_origen, ubicacion_origen)
     WHERE id = v_reg.usuario_id;
  END IF;

  -- Invitación: el padrino suma un amigo; cada "meta" amigos gana días gratis
  IF v_reg.es_nuevo AND v_codigo IS NOT NULL THEN
    SELECT id INTO v_padrino FROM bot_clima.usuarios WHERE codigo_referido = v_codigo AND id <> v_reg.usuario_id;
    IF v_padrino IS NOT NULL THEN
      UPDATE bot_clima.usuarios SET referido_por = v_padrino WHERE id = v_reg.usuario_id;
      SELECT count(*) INTO v_cuenta FROM bot_clima.usuarios WHERE referido_por = v_padrino;
      UPDATE bot_clima.usuarios p
         SET vence_el = GREATEST(p.vence_el, bot_clima.hoy()) + v_premio,
             referidos_premiados = p.referidos_premiados + 1,
             estado = CASE WHEN p.estado = 'vencido' THEN 'prueba' ELSE p.estado END
       WHERE p.id = v_padrino AND v_cuenta >= (p.referidos_premiados + 1) * v_meta;
      IF FOUND THEN
        PERFORM bot_clima.log('info', 'referidos', 'Premio por invitar amigos',
                              jsonb_build_object('usuario_id', v_padrino, 'amigos', v_cuenta, 'dias', v_premio));
      END IF;
    END IF;
  END IF;

  DELETE FROM bot_clima.registro_chat WHERE telefono = v_tel;
  SELECT * INTO v_u FROM bot_clima.usuarios WHERE id = v_reg.usuario_id;
  RETURN jsonb_build_object(
    'usuario_id', v_u.id, 'es_nuevo', v_reg.es_nuevo, 'nombre', v_u.nombre, 'zona', v_u.zona,
    'latitud', v_u.latitud, 'longitud', v_u.longitud, 'vence_el', v_u.vence_el,
    'codigo_referido', v_u.codigo_referido, 'meta', v_meta, 'premio_dias', v_premio,
    'amigos', (SELECT count(*) FROM bot_clima.usuarios WHERE referido_por = v_u.id));
END $$;

-- Para el mensaje de invitación: código, amigos y meta del cliente
CREATE OR REPLACE FUNCTION bot_clima.datos_invitacion(p_usuario_id bigint) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'codigo', u.codigo_referido,
    'amigos', (SELECT count(*) FROM bot_clima.usuarios x WHERE x.referido_por = u.id),
    'meta', GREATEST(bot_clima.cfg_num('referidos_meta', 5)::int, 1),
    'premio_dias', bot_clima.cfg_num('referidos_premio_dias', 30)::int,
    'whatsapp', bot_clima.cfg_texto('whatsapp_numero', ''))
  FROM bot_clima.usuarios u WHERE u.id = p_usuario_id
$$;

-- ---------------------------------------------------------------------
-- Bajas: quien toca "Dejar de recibir" (sea cliente o solo un contacto de una
-- difusión) no recibe más difusiones hasta que escriba "ALTA".
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bot_clima.bajas_whatsapp (
  telefono  varchar(20)  PRIMARY KEY,
  creado_el timestamptz  NOT NULL DEFAULT now()
);
COMMENT ON TABLE bot_clima.bajas_whatsapp IS 'Teléfonos que pidieron no recibir mensajes: las difusiones los omiten.';

-- ---------------------------------------------------------------------
-- Alertas: reactivar vuelve a "todas"; el lote informa si es "solo fuertes"
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION bot_clima.reactivar_alertas(p_usuario_id bigint) RETURNS void
LANGUAGE sql AS $$
  UPDATE bot_clima.usuarios
     SET alertas_activas = true, alertas_nivel = 'todas', alertas_reactivado_el = now(),
         alertas_desactivadas_el = NULL, alertas_desactivadas_por = NULL
   WHERE id = p_usuario_id
$$;

DROP FUNCTION IF EXISTS bot_clima.alerta_lluvia_lote();
CREATE FUNCTION bot_clima.alerta_lluvia_lote()
RETURNS TABLE (
  usuario_id bigint, telefono varchar, nombre varchar, chatwoot_contact_id bigint, zona varchar,
  latitud double precision, longitud double precision, ultimo_mensaje_el timestamptz,
  grupo text, grupo_lat double precision, grupo_lon double precision,
  puede_enviar boolean, motivo text, solo_fuertes boolean
)
LANGUAGE plpgsql AS $$
DECLARE
  v_tz      text := bot_clima.cfg_texto('zona_horaria', 'America/La_Paz');
  v_hora    time := (now() AT TIME ZONE v_tz)::time;
  v_activa  boolean := bot_clima.cfg_texto('lluvia_activa', 'true') = 'true';
  v_horario boolean := v_hora BETWEEN bot_clima.cfg_texto('lluvia_hora_desde', '06:00')::time
                                  AND bot_clima.cfg_texto('lluvia_hora_hasta', '20:00')::time;
  v_paso    double precision := GREATEST(bot_clima.cfg_num('lluvia_agrupar_km', 10), 1) / 111.0;
BEGIN
  PERFORM bot_clima.desactivar_sin_respuesta();

  RETURN QUERY
  SELECT c.id, c.telefono, c.nombre, c.chatwoot_contact_id, c.zona, c.latitud, c.longitud, c.ultimo_mensaje_el,
         g.lat::text || ',' || g.lon::text, g.lat, g.lon,
         x.motivo IS NULL,
         x.motivo,
         u.alertas_nivel = 'fuertes'
    FROM bot_clima.v_usuarios c
    JOIN bot_clima.usuarios u ON u.id = c.id
    CROSS JOIN LATERAL (
      SELECT round((round(c.latitud / v_paso) * v_paso)::numeric, 4)::double precision AS lat,
             round((round(c.longitud / v_paso) * v_paso)::numeric, 4)::double precision AS lon
    ) g
    CROSS JOIN LATERAL (
      SELECT CASE
               WHEN NOT v_activa                     THEN 'apagadas'
               WHEN NOT c.alertas_activas            THEN 'desactivado'
               WHEN c.alerta_bloqueada_hasta > now() THEN 'tope'
               WHEN NOT v_horario                    THEN 'horario'
             END AS motivo
    ) x
   WHERE c.vigente AND c.latitud IS NOT NULL AND c.longitud IS NOT NULL
   ORDER BY 9, c.id;
END $$;

-- ---------------------------------------------------------------------
-- Respuestas: además de "Dejar de recibir" / "Activar alertas":
--   "Solo lluvias fuertes" → activas, nivel fuertes · "ALTA" → todas
-- (igual a la 0010 + estos dos casos)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION bot_clima.registrar_respuesta(
  p_telefono     text,
  p_fecha        timestamptz DEFAULT now(),
  p_contenido    text        DEFAULT NULL,
  p_in_reply_to  bigint      DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_tel    text := regexp_replace(p_telefono, '[^0-9]', '', 'g');
  v_texto  text := lower(btrim(regexp_replace(COALESCE(p_contenido, ''), '\s+', ' ', 'g')));
  v_resp   text := left(btrim(COALESCE(p_contenido, '')), 200);
  v_uid    bigint;
  v_dias   integer := bot_clima.cfg_num('respuesta_ventana_dias', 3)::int;
  v_alerta bigint;
  v_accion text;
  n1 integer := 0; n2 integer := 0;
BEGIN
  v_texto := regexp_replace(v_texto, '^[^a-z0-9áéíóúñ]+', '');   -- "⛈️ Solo lluvias fuertes" → "solo lluvias fuertes"
  SELECT id INTO v_uid FROM bot_clima.usuarios WHERE telefono = v_tel;

  -- Lista de bajas (vale también para contactos de difusiones que no son clientes)
  IF v_texto IN ('dejar de recibir', 'no recibir alertas', 'desactivar alertas') THEN
    INSERT INTO bot_clima.bajas_whatsapp (telefono) VALUES (v_tel) ON CONFLICT DO NOTHING;
  ELSIF v_texto IN ('alta', 'activar alertas', 'recibir alertas') THEN
    DELETE FROM bot_clima.bajas_whatsapp WHERE telefono = v_tel;
  END IF;

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('usuario_id', NULL, 'marcadas', 0, 'accion',
      CASE WHEN v_texto IN ('dejar de recibir', 'no recibir alertas', 'desactivar alertas') THEN 'baja_contacto'
           WHEN v_texto IN ('alta', 'activar alertas', 'recibir alertas') THEN 'alta_contacto' END);
  END IF;

  UPDATE bot_clima.usuarios
     SET ultimo_mensaje_el = GREATEST(COALESCE(ultimo_mensaje_el, p_fecha), p_fecha)
   WHERE id = v_uid;

  UPDATE bot_clima.difusion_envios e
     SET respondio = true, respondio_el = p_fecha,
         entregado = true, entregado_el = COALESCE(e.entregado_el, p_fecha),
         leido = true, leido_el = COALESCE(e.leido_el, p_fecha)
   WHERE e.id = (
     SELECT id FROM bot_clima.difusion_envios
      WHERE usuario_id = v_uid AND enviado AND NOT respondio
        AND enviado_el BETWEEN p_fecha - make_interval(days => v_dias) AND p_fecha
      ORDER BY enviado_el DESC LIMIT 1);
  GET DIAGNOSTICS n1 = ROW_COUNT;

  IF p_in_reply_to IS NOT NULL THEN
    SELECT id INTO v_alerta FROM bot_clima.alertas_enviadas
     WHERE usuario_id = v_uid AND chatwoot_message_id = p_in_reply_to;
  END IF;
  IF v_alerta IS NULL THEN
    SELECT id INTO v_alerta FROM bot_clima.alertas_enviadas
     WHERE usuario_id = v_uid AND respondio_el IS NULL AND estado <> 'fallido'
       AND enviada_el BETWEEN p_fecha - make_interval(days => v_dias) AND p_fecha
     ORDER BY enviada_el DESC LIMIT 1;
  END IF;

  IF v_alerta IS NOT NULL THEN
    UPDATE bot_clima.alertas_enviadas a
       SET respondio_el = COALESCE(a.respondio_el, p_fecha),
           respuesta    = COALESCE(a.respuesta, NULLIF(v_resp, '')),
           estado       = CASE WHEN a.estado = 'fallido' THEN a.estado ELSE 'leido' END,
           entregado_el = COALESCE(a.entregado_el, p_fecha),
           leido_el     = COALESCE(a.leido_el, p_fecha)
     WHERE a.id = v_alerta;
    GET DIAGNOSTICS n2 = ROW_COUNT;
  END IF;

  IF v_texto IN ('dejar de recibir', 'no recibir alertas', 'desactivar alertas') THEN
    IF bot_clima.desactivar_alertas(v_uid, 'usuario') THEN
      v_accion := 'desactivado';
      PERFORM bot_clima.log('info', 'alertas', 'El usuario dejó de recibir alertas', jsonb_build_object('usuario_id', v_uid));
    END IF;
  ELSIF v_texto = 'solo lluvias fuertes' THEN
    UPDATE bot_clima.usuarios
       SET alertas_activas = true, alertas_nivel = 'fuertes', alertas_reactivado_el = now(),
           alertas_desactivadas_el = NULL, alertas_desactivadas_por = NULL
     WHERE id = v_uid;
    v_accion := 'fuertes';
    PERFORM bot_clima.log('info', 'alertas', 'El usuario eligió solo lluvias fuertes', jsonb_build_object('usuario_id', v_uid));
  ELSIF v_texto IN ('alta', 'activar alertas', 'recibir alertas') THEN
    IF NOT (SELECT alertas_activas AND alertas_nivel = 'todas' FROM bot_clima.usuarios WHERE id = v_uid) THEN
      PERFORM bot_clima.reactivar_alertas(v_uid);
      v_accion := 'reactivado';
      PERFORM bot_clima.log('info', 'alertas', 'El usuario reactivó sus alertas', jsonb_build_object('usuario_id', v_uid));
    END IF;
  END IF;

  RETURN jsonb_build_object('usuario_id', v_uid, 'marcadas', n1 + n2, 'accion', v_accion);
END $$;
