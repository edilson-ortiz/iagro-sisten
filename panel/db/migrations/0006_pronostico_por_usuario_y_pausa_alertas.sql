-- =====================================================================
-- 0006 · Próxima lluvia por usuario + pausa de alertas no leídas
-- - n8n guarda cada hora la PRÓXIMA lluvia prevista de cada usuario
--   (bot_clima.pronosticos) → el panel muestra "faltan 5 h" por usuario.
-- - La alerta se envía cuando la próxima lluvia está a N horas o menos
--   (antes se miraba solo la hora exacta a +24 h).
-- - Quien no lee N alertas seguidas deja de recibir alertas (protege el
--   número de WhatsApp de bloqueos). Sale de la pausa al escribir al bot
--   o con "Reactivar" en el panel.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Configuración
-- ---------------------------------------------------------------------
INSERT INTO bot_clima.configuracion (clave, valor, tipo, grupo, etiqueta, descripcion, orden) VALUES
('lluvia_pausar_sin_leer',  '2',  'numero', 'lluvia', 'Pausar tras N alertas no leídas',
 'Si un usuario no lee esta cantidad de alertas seguidas, deja de recibir alertas hasta que vuelva a escribir al bot o lo reactives. Evita que Meta bloquee el número. 0 = nunca pausar.', 28),
('lluvia_horas_para_leer',  '24', 'numero', 'lluvia', 'Horas para considerar "no leída"',
 'Una alerta que sigue sin leer después de estas horas cuenta como no leída.', 29)
ON CONFLICT (clave) DO NOTHING;

UPDATE bot_clima.configuracion
   SET descripcion = 'La alerta se envía cuando la próxima lluvia está a estas horas o menos (normalmente llega unas 24 h antes).'
 WHERE clave = 'lluvia_horas_anticipacion';

-- La ventana de respuesta también se usa en las alertas
UPDATE bot_clima.configuracion
   SET grupo = 'lluvia', orden = 30,
       descripcion = 'Un mensaje del usuario dentro de estos días después de una alerta (o difusión) cuenta como respuesta.'
 WHERE clave = 'respuesta_ventana_dias';

-- ---------------------------------------------------------------------
-- Próxima lluvia prevista por usuario (la escribe n8n cada hora)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bot_clima.pronosticos (
  usuario_id       bigint PRIMARY KEY REFERENCES bot_clima.usuarios(id) ON DELETE CASCADE,
  proxima_lluvia   timestamptz,          -- primera hora que supera el umbral (NULL = sin lluvia prevista)
  probabilidad     integer,
  mm               numeric(7, 1),
  horizonte_hasta  timestamptz,          -- hasta qué hora llega el pronóstico consultado
  fuente           varchar(20),
  error            text,
  consultado_el    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE bot_clima.pronosticos IS 'Última consulta de pronóstico por usuario: próxima lluvia que supera el umbral.';

CREATE OR REPLACE FUNCTION bot_clima.guardar_pronosticos(p_datos jsonb) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  n integer;
BEGIN
  INSERT INTO bot_clima.pronosticos AS p (usuario_id, proxima_lluvia, probabilidad, mm, horizonte_hasta, fuente, error, consultado_el)
  SELECT (e->>'usuario_id')::bigint,
         NULLIF(e->>'proxima_lluvia', '')::timestamptz,
         NULLIF(e->>'probabilidad', '')::numeric::int,
         NULLIF(e->>'mm', '')::numeric,
         NULLIF(e->>'horizonte_hasta', '')::timestamptz,
         NULLIF(e->>'fuente', ''),
         NULLIF(e->>'error', ''),
         now()
    FROM jsonb_array_elements(COALESCE(p_datos, '[]'::jsonb)) e
   WHERE EXISTS (SELECT 1 FROM bot_clima.usuarios u WHERE u.id = (e->>'usuario_id')::bigint)
  ON CONFLICT (usuario_id) DO UPDATE
     SET proxima_lluvia = EXCLUDED.proxima_lluvia, probabilidad = EXCLUDED.probabilidad, mm = EXCLUDED.mm,
         horizonte_hasta = EXCLUDED.horizonte_hasta, fuente = EXCLUDED.fuente, error = EXCLUDED.error,
         consultado_el = EXCLUDED.consultado_el;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- ---------------------------------------------------------------------
-- Usuarios: reactivación manual de alertas
-- ---------------------------------------------------------------------
ALTER TABLE bot_clima.usuarios ADD COLUMN IF NOT EXISTS alertas_reactivado_el timestamptz;

CREATE INDEX IF NOT EXISTS alertas_enviadas_usuario_fecha_idx ON bot_clima.alertas_enviadas (usuario_id, enviada_el DESC);

-- ---------------------------------------------------------------------
-- Vista de usuarios (se recrea: nuevas columnas de pausa de alertas)
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
  -- Alertas seguidas sin leer (después de la última leída, del último mensaje del usuario y de su reactivación)
  COALESCE(sl.seguidas, 0)                                                AS alertas_sin_leer,
  (bot_clima.cfg_num('lluvia_pausar_sin_leer', 2) > 0
   AND COALESCE(sl.seguidas, 0) >= bot_clima.cfg_num('lluvia_pausar_sin_leer', 2)) AS alertas_pausadas
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
     AND a.estado IN ('enviado', 'entregado') AND a.respondio_el IS NULL
     AND a.enviada_el < now() - make_interval(hours => bot_clima.cfg_num('lluvia_horas_para_leer', 24)::int)
     AND a.enviada_el > GREATEST(
           COALESCE(u.ultimo_mensaje_el, '-infinity'),
           COALESCE(u.alertas_reactivado_el, '-infinity'),
           COALESCE((SELECT max(b.enviada_el) FROM bot_clima.alertas_enviadas b
                      WHERE b.usuario_id = u.id AND b.tipo = 'lluvia' AND b.estado = 'leido'), '-infinity'))
) sl ON true;

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
     AND NOT alertas_pausadas
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
-- Lote para n8n: TODOS los vigentes con ubicación (para guardar su
-- próxima lluvia) y, por cada uno, si se le puede enviar alerta ahora.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS bot_clima.alerta_lluvia_lote();

CREATE FUNCTION bot_clima.alerta_lluvia_lote()
RETURNS TABLE (
  usuario_id bigint, telefono varchar, nombre varchar, chatwoot_contact_id bigint, zona varchar,
  latitud double precision, longitud double precision, ultimo_mensaje_el timestamptz,
  grupo text, grupo_lat double precision, grupo_lon double precision,
  puede_enviar boolean, motivo text
)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_tz      text := bot_clima.cfg_texto('zona_horaria', 'America/La_Paz');
  v_hora    time := (now() AT TIME ZONE v_tz)::time;
  v_activa  boolean := bot_clima.cfg_texto('lluvia_activa', 'true') = 'true';
  v_horario boolean := v_hora BETWEEN bot_clima.cfg_texto('lluvia_hora_desde', '06:00')::time
                                  AND bot_clima.cfg_texto('lluvia_hora_hasta', '20:00')::time;
  v_paso    double precision := GREATEST(bot_clima.cfg_num('lluvia_agrupar_km', 10), 1) / 111.0;  -- km → grados aprox.
BEGIN
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
               WHEN NOT v_activa                  THEN 'apagadas'
               WHEN c.alertas_pausadas            THEN 'pausado'
               WHEN c.alerta_bloqueada_hasta > now() THEN 'tope'
               WHEN NOT v_horario                 THEN 'horario'
             END AS motivo
    ) x
   WHERE c.vigente AND c.latitud IS NOT NULL AND c.longitud IS NOT NULL
   ORDER BY 9, c.id;
END $$;

CREATE OR REPLACE FUNCTION bot_clima.reactivar_alertas(p_usuario_id bigint) RETURNS void
LANGUAGE sql AS $$
  UPDATE bot_clima.usuarios SET alertas_reactivado_el = now() WHERE id = p_usuario_id
$$;
