-- =====================================================================
-- 0010 · Alertas de lluvia: interruptor por usuario + respuestas
-- - Cada usuario tiene sus alertas activas o desactivadas (panel).
-- - Se desactivan solas:
--     · si el usuario toca "Dejar de recibir" en la plantilla, o
--     · si no responde N alertas seguidas (protege el número ante Meta).
--   Una vez desactivadas, solo vuelven si las reactivas en el panel o si
--   el usuario escribe "Activar alertas".
-- - Se guarda qué respondió a cada alerta (botón tocado o texto).
-- - La alerta siempre va con la plantilla aprobada notificacion_pronostico.
-- Reemplaza la "pausa por no leer" de la 0006.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Columnas nuevas
-- ---------------------------------------------------------------------
ALTER TABLE bot_clima.usuarios ADD COLUMN IF NOT EXISTS alertas_activas boolean NOT NULL DEFAULT true;
ALTER TABLE bot_clima.usuarios ADD COLUMN IF NOT EXISTS alertas_desactivadas_el timestamptz;
ALTER TABLE bot_clima.usuarios ADD COLUMN IF NOT EXISTS alertas_desactivadas_por varchar(15)
  CHECK (alertas_desactivadas_por IN ('panel', 'usuario', 'sin_respuesta'));
COMMENT ON COLUMN bot_clima.usuarios.alertas_desactivadas_por IS
  'panel = admin · usuario = tocó "Dejar de recibir" · sin_respuesta = no respondió N alertas seguidas';

-- La regla cambia de "no leer" a "no responder": el conteo empieza de cero para no
-- desactivar a nadie por alertas enviadas antes de esta regla.
UPDATE bot_clima.usuarios SET alertas_reactivado_el = now()
 WHERE NOT EXISTS (SELECT 1 FROM bot_clima.schema_migrations WHERE version = '0010_alertas_por_usuario_y_respuestas.sql');

ALTER TABLE bot_clima.alertas_enviadas ADD COLUMN IF NOT EXISTS respuesta varchar(200);
COMMENT ON COLUMN bot_clima.alertas_enviadas.respuesta IS 'Lo que respondió el usuario (texto del botón o mensaje).';

-- ---------------------------------------------------------------------
-- Configuración
-- ---------------------------------------------------------------------
UPDATE bot_clima.configuracion
   SET etiqueta = 'Desactivar tras N alertas sin respuesta',
       descripcion = 'Si el usuario no responde esta cantidad de alertas seguidas, se le desactivan las alertas (protege el número de bloqueos de Meta). Solo vuelven si lo reactivas o si escribe "Activar alertas". 0 = nunca desactivar.'
 WHERE clave = 'lluvia_pausar_sin_leer';

UPDATE bot_clima.configuracion
   SET etiqueta = 'Horas para responder',
       descripcion = 'Una alerta sin respuesta después de estas horas cuenta como "no respondida".'
 WHERE clave = 'lluvia_horas_para_leer';

UPDATE bot_clima.configuracion
   SET valor = '"notificacion_pronostico"'
 WHERE clave = 'plantilla_lluvia' AND valor = '"alerta_lluvia"';
UPDATE bot_clima.configuracion
   SET descripcion = 'Plantilla aprobada por Meta para la alerta. Variables: {{1}} saludo, {{2}} nombre del campo, {{3}} pronóstico. Botones: Pronóstico 7 días · ¿A qué hora llueve? · Dejar de recibir.'
 WHERE clave = 'plantilla_lluvia';

INSERT INTO bot_clima.configuracion (clave, valor, tipo, grupo, etiqueta, descripcion, orden) VALUES
('lluvia_saludo', '"Agricultor"', 'texto', 'lluvia', 'Saludo de la alerta',
 'Va en "Hola {{1}} 👋" de la plantilla.', 31)
ON CONFLICT (clave) DO NOTHING;

-- ---------------------------------------------------------------------
-- Vista de usuarios (igual a la 0006, con alertas por usuario)
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS bot_clima.v_usuarios CASCADE;

CREATE VIEW bot_clima.v_usuarios AS
SELECT
  u.*,
  (u.vence_el - bot_clima.hoy())                                          AS dias_restantes,
  (u.activo AND u.estado <> 'vencido' AND u.vence_el >= bot_clima.hoy())  AS vigente,
  COALESCE(al.n7, 0)                                                      AS alertas_7d,
  GREATEST(
    CASE WHEN al.n7 >= GREATEST(bot_clima.cfg_num('lluvia_max_por_semana', 1)::int, 1)
         THEN al.enesima + interval '7 days' END,
    u.ultima_alerta_lluvia + make_interval(hours => bot_clima.cfg_num('lluvia_horas_entre_alertas', 48)::int)
  )                                                                       AS alerta_bloqueada_hasta,
  COALESCE(df.seguidas, 0)                                                AS difusiones_sin_respuesta,
  (bot_clima.cfg_num('difusion_pausar_sin_respuesta', 1) > 0
   AND COALESCE(df.seguidas, 0) >= bot_clima.cfg_num('difusion_pausar_sin_respuesta', 1)) AS difusion_pausada,
  p.ultimo_pago,
  COALESCE(p.total_pagado, 0)                                             AS total_pagado,
  COALESCE(p.cantidad_pagos, 0)                                           AS cantidad_pagos,
  -- Alertas seguidas sin respuesta (después de la última respondida, del último mensaje del usuario y de su reactivación)
  COALESCE(sr.seguidas, 0)                                                AS alertas_sin_respuesta
FROM bot_clima.usuarios u
LEFT JOIN LATERAL (
  SELECT count(*) AS n7,
         (array_agg(a.enviada_el ORDER BY a.enviada_el DESC))[GREATEST(bot_clima.cfg_num('lluvia_max_por_semana', 1)::int, 1)] AS enesima
    FROM bot_clima.alertas_enviadas a
   WHERE a.usuario_id = u.id AND a.tipo = 'lluvia' AND a.estado <> 'fallido'
     AND a.enviada_el > now() - interval '7 days'
) al ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS seguidas
    FROM bot_clima.difusion_envios e
   WHERE e.usuario_id = u.id AND e.enviado AND e.error IS NULL AND NOT e.respondio
     AND e.enviado_el > GREATEST(COALESCE(u.ultimo_mensaje_el, '-infinity'), COALESCE(u.difusiones_reactivado_el, '-infinity'))
     AND e.enviado_el < now() - make_interval(days => bot_clima.cfg_num('respuesta_ventana_dias', 3)::int)
) df ON true
LEFT JOIN LATERAL (
  SELECT max(fecha) AS ultimo_pago, sum(monto) AS total_pagado, count(*) AS cantidad_pagos
    FROM bot_clima.pagos WHERE usuario_id = u.id
) p ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS seguidas
    FROM bot_clima.alertas_enviadas a
   WHERE a.usuario_id = u.id AND a.tipo = 'lluvia'
     AND a.estado <> 'fallido' AND a.respondio_el IS NULL
     AND a.enviada_el < now() - make_interval(hours => bot_clima.cfg_num('lluvia_horas_para_leer', 24)::int)
     AND a.enviada_el > GREATEST(
           COALESCE(u.ultimo_mensaje_el, '-infinity'),
           COALESCE(u.alertas_reactivado_el, '-infinity'),
           COALESCE((SELECT max(b.enviada_el) FROM bot_clima.alertas_enviadas b
                      WHERE b.usuario_id = u.id AND b.tipo = 'lluvia' AND b.respondio_el IS NOT NULL), '-infinity'))
) sr ON true;

-- Funciones que dependían de la vista (iguales a la 0006 salvo el filtro de alertas)
CREATE FUNCTION bot_clima.usuarios_por_vencer()
RETURNS SETOF bot_clima.v_usuarios
LANGUAGE sql STABLE AS $$
  SELECT * FROM bot_clima.v_usuarios
   WHERE vigente
     AND dias_restantes BETWEEN 0 AND bot_clima.cfg_num('aviso_vencimiento_dias', 3)
     AND (aviso_vencimiento_el IS NULL OR aviso_vencimiento_el < vence_el - bot_clima.cfg_num('aviso_vencimiento_dias', 3)::int)
$$;

CREATE FUNCTION bot_clima.usuarios_para_alerta_lluvia()
RETURNS SETOF bot_clima.v_usuarios
LANGUAGE sql STABLE AS $$
  SELECT * FROM bot_clima.v_usuarios
   WHERE vigente
     AND alertas_activas
     AND latitud IS NOT NULL AND longitud IS NOT NULL
     AND (alerta_bloqueada_hasta IS NULL OR alerta_bloqueada_hasta <= now())
$$;

CREATE FUNCTION bot_clima.usuarios_por_segmento(p_segmento text, p_zona text DEFAULT NULL, p_incluir_pausados boolean DEFAULT false)
RETURNS SETOF bot_clima.v_usuarios
LANGUAGE sql STABLE AS $$
  SELECT * FROM bot_clima.v_usuarios v
   WHERE v.activo
     AND (p_incluir_pausados OR NOT v.difusion_pausada)
     AND CASE p_segmento
           WHEN 'todos'   THEN true
           WHEN 'prueba'  THEN v.estado = 'prueba'
           WHEN 'pagado'  THEN v.estado = 'pagado'
           WHEN 'vencido' THEN v.estado = 'vencido'
           WHEN 'zona'    THEN lower(v.zona) = lower(p_zona)
           ELSE false
         END
$$;

-- ---------------------------------------------------------------------
-- Activar / desactivar
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION bot_clima.desactivar_alertas(p_usuario_id bigint, p_por text) RETURNS boolean
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE bot_clima.usuarios
     SET alertas_activas = false, alertas_desactivadas_el = now(), alertas_desactivadas_por = p_por
   WHERE id = p_usuario_id AND alertas_activas;
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION bot_clima.reactivar_alertas(p_usuario_id bigint) RETURNS void
LANGUAGE sql AS $$
  UPDATE bot_clima.usuarios
     SET alertas_activas = true, alertas_reactivado_el = now(),
         alertas_desactivadas_el = NULL, alertas_desactivadas_por = NULL
   WHERE id = p_usuario_id
$$;

-- Desactiva a quienes no respondieron N alertas seguidas. La llama alerta_lluvia_lote() cada hora.
CREATE OR REPLACE FUNCTION bot_clima.desactivar_sin_respuesta() RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  v_n   integer := bot_clima.cfg_num('lluvia_pausar_sin_leer', 3)::int;
  v_ids bigint[];
BEGIN
  IF v_n <= 0 THEN RETURN 0; END IF;

  WITH x AS (
    UPDATE bot_clima.usuarios u
       SET alertas_activas = false, alertas_desactivadas_el = now(), alertas_desactivadas_por = 'sin_respuesta'
      FROM bot_clima.v_usuarios v
     WHERE v.id = u.id AND u.alertas_activas AND v.alertas_sin_respuesta >= v_n
    RETURNING u.id
  )
  SELECT array_agg(id) INTO v_ids FROM x;

  IF v_ids IS NOT NULL THEN
    PERFORM bot_clima.log('aviso', 'alertas', 'Alertas desactivadas por no responder',
                          jsonb_build_object('usuarios', v_ids, 'alertas_sin_respuesta', v_n));
  END IF;
  RETURN COALESCE(array_length(v_ids, 1), 0);
END $$;

-- ---------------------------------------------------------------------
-- Lote horario para n8n (como la 0006; primero aplica las desactivaciones)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS bot_clima.alerta_lluvia_lote();

CREATE FUNCTION bot_clima.alerta_lluvia_lote()
RETURNS TABLE (
  usuario_id bigint, telefono varchar, nombre varchar, chatwoot_contact_id bigint, zona varchar,
  latitud double precision, longitud double precision, ultimo_mensaje_el timestamptz,
  grupo text, grupo_lat double precision, grupo_lon double precision,
  puede_enviar boolean, motivo text
)
LANGUAGE plpgsql AS $$
DECLARE
  v_tz      text := bot_clima.cfg_texto('zona_horaria', 'America/La_Paz');
  v_hora    time := (now() AT TIME ZONE v_tz)::time;
  v_activa  boolean := bot_clima.cfg_texto('lluvia_activa', 'true') = 'true';
  v_horario boolean := v_hora BETWEEN bot_clima.cfg_texto('lluvia_hora_desde', '06:00')::time
                                  AND bot_clima.cfg_texto('lluvia_hora_hasta', '20:00')::time;
  v_paso    double precision := GREATEST(bot_clima.cfg_num('lluvia_agrupar_km', 10), 1) / 111.0;  -- km → grados aprox.
BEGIN
  PERFORM bot_clima.desactivar_sin_respuesta();

  RETURN QUERY
  SELECT c.id, c.telefono, c.nombre, c.chatwoot_contact_id, c.zona, c.latitud, c.longitud, c.ultimo_mensaje_el,
         g.lat::text || ',' || g.lon::text, g.lat, g.lon,
         x.motivo IS NULL,
         x.motivo
    FROM bot_clima.v_usuarios c
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
-- Respuestas (webhook de Chatwoot → n8n)
-- p_in_reply_to: id del mensaje de Chatwoot al que responde (los botones de la
-- plantilla lo traen) → se marca exactamente esa alerta.
-- Devuelve {usuario_id, marcadas, accion} con accion = 'desactivado' | 'reactivado' | null
-- para que n8n confirme al usuario.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS bot_clima.registrar_respuesta(text, timestamptz);

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
  SELECT id INTO v_uid FROM bot_clima.usuarios WHERE telefono = v_tel;
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('usuario_id', NULL, 'marcadas', 0, 'accion', NULL);
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

  -- Alerta respondida: la del botón (in_reply_to) o, si no, la última sin respuesta dentro de la ventana
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

  -- Botón "Dejar de recibir" de la plantilla (o lo escribe) / "Activar alertas"
  IF v_texto IN ('dejar de recibir', 'no recibir alertas', 'desactivar alertas') THEN
    IF bot_clima.desactivar_alertas(v_uid, 'usuario') THEN
      v_accion := 'desactivado';
      PERFORM bot_clima.log('info', 'alertas', 'El usuario dejó de recibir alertas', jsonb_build_object('usuario_id', v_uid));
    END IF;
  ELSIF v_texto IN ('activar alertas', 'recibir alertas') THEN
    IF NOT (SELECT alertas_activas FROM bot_clima.usuarios WHERE id = v_uid) THEN
      PERFORM bot_clima.reactivar_alertas(v_uid);
      v_accion := 'reactivado';
      PERFORM bot_clima.log('info', 'alertas', 'El usuario reactivó sus alertas', jsonb_build_object('usuario_id', v_uid));
    END IF;
  END IF;

  RETURN jsonb_build_object('usuario_id', v_uid, 'marcadas', n1 + n2, 'accion', v_accion);
END $$;
