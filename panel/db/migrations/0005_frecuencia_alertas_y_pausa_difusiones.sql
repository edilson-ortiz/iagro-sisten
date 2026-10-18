-- =====================================================================
-- 0005 · Frecuencia de alertas configurable + pausa por falta de respuesta
-- - Alertas de lluvia: "máximo N por semana" y "mínimo X horas entre alertas"
--   (reemplaza la regla fija de "1 cada 7 días").
-- - Fuente del pronóstico configurable (API IAGRO u Open-Meteo).
-- - Difusiones: quien no responde N difusiones seguidas deja de recibirlas
--   hasta que vuelva a escribir o se lo reactive desde el panel.
-- - Integración panel ↔ n8n: URL del webhook y token guardados en la base.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Configuración: tipos nuevos (opción y secreto) + lista de opciones
-- ---------------------------------------------------------------------
ALTER TABLE bot_clima.configuracion DROP CONSTRAINT IF EXISTS configuracion_tipo_check;
ALTER TABLE bot_clima.configuracion
  ADD CONSTRAINT configuracion_tipo_check
  CHECK (tipo IN ('numero', 'texto', 'texto_largo', 'booleano', 'hora', 'opcion', 'secreto'));
ALTER TABLE bot_clima.configuracion ADD COLUMN IF NOT EXISTS opciones jsonb;

DELETE FROM bot_clima.configuracion WHERE clave = 'lluvia_dias_bloqueo';

INSERT INTO bot_clima.configuracion (clave, valor, tipo, grupo, etiqueta, descripcion, orden, opciones) VALUES
('lluvia_fuente',              '"iagro"',                    'opcion',  'lluvia', 'Fuente del pronóstico',
 'De dónde se obtiene la probabilidad de lluvia.', 19,
 '[{"valor":"iagro","etiqueta":"API IAGRO (forecast/hourly)"},{"valor":"open-meteo","etiqueta":"Open-Meteo (gratis, global)"}]'),
('lluvia_api_url',             '"http://192.168.1.10:3001"', 'texto',   'lluvia', 'URL de la API IAGRO',
 'Se consulta {URL}/forecast/hourly?lat=..&lon=.. (la misma que usa el bot).', 19, NULL),
('lluvia_max_por_semana',      '1',                          'numero',  'lluvia', 'Máximo de alertas por semana',
 'Cuántas alertas de lluvia puede recibir un usuario en 7 días (1 = una por semana, 2 = dos por semana...).', 23, NULL),
('lluvia_horas_entre_alertas', '48',                         'numero',  'lluvia', 'Horas mínimas entre alertas',
 'Evita dos alertas seguidas por la misma lluvia (solo aplica si el máximo semanal es mayor a 1).', 24, NULL),
('lluvia_mm_minimo',           '0',                          'numero',  'lluvia', 'Lluvia mínima (mm)',
 'Además del porcentaje, exige al menos estos milímetros en esa hora. 0 = no se exige.', 22, NULL),
('difusion_pausar_sin_respuesta', '1',                       'numero',  'difusiones', 'Pausar tras N difusiones sin respuesta',
 'Si un usuario no responde esta cantidad de difusiones seguidas, deja de recibir difusiones hasta que vuelva a escribir. 0 = nunca pausar. No afecta las alertas de lluvia.', 52, NULL),
('n8n_webhook_difusion',       '""',                         'texto',   'integraciones', 'Webhook de n8n para difusiones',
 'URL de producción del webhook del flujo "IAGRO · Difusiones" (n8n → nodo Webhook → Production URL).', 70, NULL),
('n8n_token',                  to_jsonb(md5(random()::text || clock_timestamp()::text) || md5(random()::text)), 'secreto', 'integraciones', 'Token panel ↔ n8n',
 'Clave compartida que el panel envía a n8n. Se genera sola; no hace falta cambiarla.', 71, NULL)
ON CONFLICT (clave) DO NOTHING;

UPDATE bot_clima.configuracion SET orden = 25 WHERE clave = 'lluvia_hora_desde';
UPDATE bot_clima.configuracion SET orden = 26 WHERE clave = 'lluvia_hora_hasta';
UPDATE bot_clima.configuracion SET orden = 27 WHERE clave = 'lluvia_agrupar_km';
UPDATE bot_clima.configuracion
   SET descripcion = 'Nombre exacto de la plantilla aprobada por Meta. Variables: {{1}} nombre, {{2}} día y hora, {{3}} probabilidad (%).'
 WHERE clave = 'plantilla_lluvia';
UPDATE bot_clima.configuracion
   SET descripcion = 'Plantilla con una variable {{1}} que lleva el texto de la difusión (sin saltos de línea). Si el usuario escribió en las últimas 24 h se envía como mensaje normal.'
 WHERE clave = 'plantilla_difusion';

-- ---------------------------------------------------------------------
-- Usuarios: último mensaje recibido y reactivación manual de difusiones
-- ---------------------------------------------------------------------
ALTER TABLE bot_clima.usuarios ADD COLUMN IF NOT EXISTS ultimo_mensaje_el timestamptz;
ALTER TABLE bot_clima.usuarios ADD COLUMN IF NOT EXISTS difusiones_reactivado_el timestamptz;

-- Configuración completa como JSON (la usan los flujos de n8n en una sola consulta)
CREATE OR REPLACE FUNCTION bot_clima.config_json(p_incluir_secretos boolean DEFAULT false) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(jsonb_object_agg(clave, valor), '{}'::jsonb)
    FROM bot_clima.configuracion
   WHERE p_incluir_secretos OR tipo <> 'secreto'
$$;

-- ---------------------------------------------------------------------
-- Vista de usuarios (se recrea: cambian columnas y reglas)
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS bot_clima.v_usuarios CASCADE;  -- también elimina las funciones SETOF v_usuarios (se recrean abajo)

CREATE VIEW bot_clima.v_usuarios AS
SELECT
  u.*,
  (u.vence_el - bot_clima.hoy())                                          AS dias_restantes,
  (u.activo AND u.estado <> 'vencido' AND u.vence_el >= bot_clima.hoy())  AS vigente,
  COALESCE(al.n7, 0)                                                      AS alertas_7d,
  -- Hasta cuándo no puede recibir otra alerta: por tope semanal o por horas mínimas
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
  COALESCE(p.cantidad_pagos, 0)                                           AS cantidad_pagos
FROM bot_clima.usuarios u
LEFT JOIN LATERAL (
  SELECT count(*) AS n7,
         (array_agg(a.enviada_el ORDER BY a.enviada_el DESC))[GREATEST(bot_clima.cfg_num('lluvia_max_por_semana', 1)::int, 1)] AS enesima
    FROM bot_clima.alertas_enviadas a
   WHERE a.usuario_id = u.id AND a.tipo = 'lluvia' AND a.estado <> 'fallido'
     AND a.enviada_el > now() - interval '7 days'
) al ON true
LEFT JOIN LATERAL (
  -- Difusiones enviadas DESPUÉS del último mensaje del usuario (y de su reactivación),
  -- cuya ventana de respuesta ya cerró sin respuesta
  SELECT count(*) AS seguidas
    FROM bot_clima.difusion_envios e
   WHERE e.usuario_id = u.id AND e.enviado AND e.error IS NULL AND NOT e.respondio
     AND e.enviado_el > GREATEST(COALESCE(u.ultimo_mensaje_el, '-infinity'), COALESCE(u.difusiones_reactivado_el, '-infinity'))
     AND e.enviado_el < now() - make_interval(days => bot_clima.cfg_num('respuesta_ventana_dias', 3)::int)
) df ON true
LEFT JOIN LATERAL (
  SELECT max(fecha) AS ultimo_pago, sum(monto) AS total_pagado, count(*) AS cantidad_pagos
    FROM bot_clima.pagos WHERE usuario_id = u.id
) p ON true;

-- ---------------------------------------------------------------------
-- Funciones recreadas sobre la nueva vista
-- ---------------------------------------------------------------------
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
     AND latitud IS NOT NULL AND longitud IS NOT NULL
     AND (alerta_bloqueada_hasta IS NULL OR alerta_bloqueada_hasta <= now())
$$;

-- Destinatarios de una difusión. Por defecto excluye a los pausados por no responder.
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
-- Alerta de lluvia: lote listo para n8n
-- Devuelve los candidatos de ESTA hora, agrupados por cercanía, o nada si
-- las alertas están apagadas o se está fuera del horario de envío.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION bot_clima.alerta_lluvia_lote()
RETURNS TABLE (
  usuario_id bigint, telefono varchar, nombre varchar, chatwoot_contact_id bigint, zona varchar,
  latitud double precision, longitud double precision, ultimo_mensaje_el timestamptz,
  grupo text, grupo_lat double precision, grupo_lon double precision
)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_tz    text := bot_clima.cfg_texto('zona_horaria', 'America/La_Paz');
  v_hora  time := (now() AT TIME ZONE v_tz)::time;
  v_paso  double precision := GREATEST(bot_clima.cfg_num('lluvia_agrupar_km', 10), 1) / 111.0;  -- km → grados aprox.
BEGIN
  IF bot_clima.cfg_texto('lluvia_activa', 'true') <> 'true' THEN
    RETURN;
  END IF;
  IF v_hora < bot_clima.cfg_texto('lluvia_hora_desde', '06:00')::time
     OR v_hora > bot_clima.cfg_texto('lluvia_hora_hasta', '20:00')::time THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT c.id, c.telefono, c.nombre, c.chatwoot_contact_id, c.zona, c.latitud, c.longitud, c.ultimo_mensaje_el,
         g.lat::text || ',' || g.lon::text,
         g.lat, g.lon
    FROM bot_clima.usuarios_para_alerta_lluvia() c
    CROSS JOIN LATERAL (
      SELECT round((round(c.latitud / v_paso) * v_paso)::numeric, 4)::double precision AS lat,
             round((round(c.longitud / v_paso) * v_paso)::numeric, 4)::double precision AS lon
    ) g
   ORDER BY 9, c.id;
END $$;

-- ---------------------------------------------------------------------
-- Respuestas: ahora también guarda el último mensaje del usuario
-- (eso además saca al usuario de la pausa de difusiones)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION bot_clima.registrar_respuesta(p_telefono text, p_fecha timestamptz DEFAULT now())
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  v_tel   text := regexp_replace(p_telefono, '[^0-9]', '', 'g');
  v_uid   bigint;
  v_dias  integer := bot_clima.cfg_num('respuesta_ventana_dias', 3)::int;
  n1 integer := 0; n2 integer := 0;
BEGIN
  SELECT id INTO v_uid FROM bot_clima.usuarios WHERE telefono = v_tel;
  IF v_uid IS NULL THEN
    RETURN 0;
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

  UPDATE bot_clima.alertas_enviadas a
     SET respondio_el = p_fecha,
         estado = CASE WHEN a.estado = 'fallido' THEN a.estado ELSE 'leido' END,
         leido_el = COALESCE(a.leido_el, p_fecha)
   WHERE a.id = (
     SELECT id FROM bot_clima.alertas_enviadas
      WHERE usuario_id = v_uid AND respondio_el IS NULL AND estado <> 'fallido'
        AND enviada_el BETWEEN p_fecha - make_interval(days => v_dias) AND p_fecha
      ORDER BY enviada_el DESC LIMIT 1);
  GET DIAGNOSTICS n2 = ROW_COUNT;

  RETURN n1 + n2;
END $$;

CREATE OR REPLACE FUNCTION bot_clima.reactivar_difusiones(p_usuario_id bigint) RETURNS void
LANGUAGE sql AS $$
  UPDATE bot_clima.usuarios SET difusiones_reactivado_el = now() WHERE id = p_usuario_id
$$;

-- ---------------------------------------------------------------------
-- Envío de difusiones (los llama el flujo de n8n)
-- ---------------------------------------------------------------------
-- Marca la difusión como "enviando", carga los destinatarios y los devuelve.
CREATE OR REPLACE FUNCTION bot_clima.preparar_difusion(p_difusion_id bigint)
RETURNS TABLE (
  envio_id bigint, usuario_id bigint, telefono varchar, nombre varchar, chatwoot_contact_id bigint,
  ultimo_mensaje_el timestamptz, mensaje text, plantilla varchar, plantilla_idioma varchar
)
LANGUAGE plpgsql AS $$
DECLARE
  v_d bot_clima.difusiones;
BEGIN
  SELECT * INTO v_d FROM bot_clima.difusiones WHERE id = p_difusion_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Difusión % no existe', p_difusion_id;
  END IF;
  IF v_d.estado NOT IN ('borrador', 'error') THEN
    RAISE EXCEPTION 'La difusión % ya está en estado "%"', p_difusion_id, v_d.estado;
  END IF;

  -- Difusión normal: destinatarios del segmento (sin pausados). Reenvío: ya vienen precargados.
  IF v_d.difusion_origen_id IS NULL THEN
    INSERT INTO bot_clima.difusion_envios (difusion_id, usuario_id)
    SELECT v_d.id, s.id FROM bot_clima.usuarios_por_segmento(v_d.segmento, v_d.segmento_zona) s
    ON CONFLICT ON CONSTRAINT difusion_envios_unico DO NOTHING;
  END IF;

  UPDATE bot_clima.difusiones
     SET estado = 'enviando',
         total_destinatarios = (SELECT count(*) FROM bot_clima.difusion_envios WHERE difusion_id = v_d.id)
   WHERE id = v_d.id;

  RETURN QUERY
  SELECT e.id, u.id, u.telefono, u.nombre, u.chatwoot_contact_id, u.ultimo_mensaje_el,
         v_d.mensaje, v_d.plantilla, v_d.plantilla_idioma
    FROM bot_clima.difusion_envios e
    JOIN bot_clima.usuarios u ON u.id = e.usuario_id
   WHERE e.difusion_id = v_d.id AND NOT e.enviado
   ORDER BY e.id;
END $$;

CREATE OR REPLACE FUNCTION bot_clima.registrar_envio_difusion(
  p_envio_id bigint, p_conversation_id bigint, p_message_id bigint, p_contact_id bigint DEFAULT NULL, p_error text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE bot_clima.difusion_envios
     SET enviado = (p_error IS NULL), enviado_el = now(), error = p_error,
         chatwoot_conversation_id = p_conversation_id, chatwoot_message_id = p_message_id
   WHERE id = p_envio_id;
  IF p_contact_id IS NOT NULL THEN
    UPDATE bot_clima.usuarios u SET chatwoot_contact_id = p_contact_id
      FROM bot_clima.difusion_envios e
     WHERE e.id = p_envio_id AND u.id = e.usuario_id AND u.chatwoot_contact_id IS DISTINCT FROM p_contact_id
       AND NOT EXISTS (SELECT 1 FROM bot_clima.usuarios x WHERE x.chatwoot_contact_id = p_contact_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION bot_clima.finalizar_difusion(p_difusion_id bigint) RETURNS bot_clima.difusiones
LANGUAGE plpgsql AS $$
DECLARE
  v_d bot_clima.difusiones;
  v_ok integer; v_total integer;
BEGIN
  SELECT count(*) FILTER (WHERE enviado), count(*) INTO v_ok, v_total
    FROM bot_clima.difusion_envios WHERE difusion_id = p_difusion_id;
  UPDATE bot_clima.difusiones
     SET estado = CASE WHEN v_total > 0 AND v_ok = 0 THEN 'error' ELSE 'enviada' END,
         enviada_el = now()
   WHERE id = p_difusion_id
  RETURNING * INTO v_d;
  RETURN v_d;
END $$;

-- Alertas: registrar también el contacto de Chatwoot cuando n8n lo descubre
CREATE OR REPLACE FUNCTION bot_clima.vincular_contacto(p_usuario_id bigint, p_contact_id bigint) RETURNS void
LANGUAGE sql AS $$
  UPDATE bot_clima.usuarios SET chatwoot_contact_id = p_contact_id
   WHERE id = p_usuario_id AND p_contact_id IS NOT NULL
     AND chatwoot_contact_id IS DISTINCT FROM p_contact_id
     AND NOT EXISTS (SELECT 1 FROM bot_clima.usuarios x WHERE x.chatwoot_contact_id = p_contact_id)
$$;

-- ---------------------------------------------------------------------
-- Seguimiento de estados por consulta periódica (n8n cada 10 min):
-- mensajes de los últimos 3 días que todavía pueden cambiar de estado
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION bot_clima.mensajes_por_actualizar()
RETURNS TABLE (conversation_id bigint, message_ids bigint[])
LANGUAGE sql STABLE AS $$
  SELECT conv, array_agg(DISTINCT msg)
    FROM (
      SELECT chatwoot_conversation_id AS conv, chatwoot_message_id AS msg
        FROM bot_clima.difusion_envios
       WHERE enviado AND NOT leido AND error IS NULL AND chatwoot_message_id IS NOT NULL
         AND enviado_el > now() - interval '3 days'
      UNION ALL
      SELECT chatwoot_conversation_id, chatwoot_message_id
        FROM bot_clima.alertas_enviadas
       WHERE estado IN ('enviado', 'entregado') AND chatwoot_message_id IS NOT NULL
         AND enviada_el > now() - interval '3 days'
    ) m
   WHERE conv IS NOT NULL
   GROUP BY conv
$$;
