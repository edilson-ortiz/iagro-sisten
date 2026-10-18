-- =====================================================================
-- 0008 · Ciclo de tokens por usuario
-- Los tokens ya no se cuentan por mes calendario sino por el ciclo de cada
-- usuario: empiezan el día en que se registró y se renuevan ese mismo día
-- cada mes (10 oct → 10 nov → 10 dic…). Si dejó vencer la suscripción y
-- vuelve a pagar, el ciclo arranca de nuevo desde el día de ese pago.
-- Lo no usado no se acumula al ciclo siguiente.
-- (El mes calendario sigue disponible en el panel como analítica.)
-- =====================================================================

UPDATE bot_clima.configuracion
   SET etiqueta = 'Tokens por ciclo mensual',
       descripcion = 'Mensajes salientes incluidos por ciclo. Cada usuario renueva sus tokens el mismo día del mes en que se registró (o en que volvió a pagar tras vencer). No se acumulan. Si el plan del último pago tiene su propio límite, se usa ese.'
 WHERE clave = 'tokens_mes';

-- Día en que empezó la suscripción continua actual (ancla del ciclo)
CREATE OR REPLACE FUNCTION bot_clima.ancla_tokens(p_usuario_id bigint, p_fecha date DEFAULT NULL) RETURNS date
LANGUAGE sql STABLE AS $$
  WITH z AS (SELECT bot_clima.cfg_texto('zona_horaria', 'America/La_Paz') AS z, COALESCE(p_fecha, bot_clima.hoy()) AS hoy)
  SELECT COALESCE(
    -- último pago hecho con la suscripción ya vencida: reinicia el ciclo
    (SELECT max((p.fecha AT TIME ZONE z.z)::date)
       FROM bot_clima.pagos p
      WHERE p.usuario_id = p_usuario_id
        AND p.vence_anterior < (p.fecha AT TIME ZONE z.z)::date
        AND (p.fecha AT TIME ZONE z.z)::date <= z.hoy),
    (u.fecha_registro AT TIME ZONE z.z)::date)
  FROM bot_clima.usuarios u, z
  WHERE u.id = p_usuario_id
$$;

-- Ciclo que contiene p_fecha (hoy por defecto): [inicio, fin) en fechas locales.
-- Siempre se calcula desde el ancla (no encadenado), así un 31 no se corre al 28.
CREATE OR REPLACE FUNCTION bot_clima.ciclo_tokens(p_usuario_id bigint, p_fecha date DEFAULT NULL)
RETURNS TABLE (inicio date, fin date)
LANGUAGE sql STABLE AS $$
  WITH a AS (
    SELECT bot_clima.ancla_tokens(p_usuario_id, p_fecha) AS ancla, COALESCE(p_fecha, bot_clima.hoy()) AS hoy
  ),
  k AS (
    SELECT ancla, (
      SELECT max(n) FROM generate_series(
               GREATEST(0, (extract(year FROM age(hoy, ancla)) * 12 + extract(month FROM age(hoy, ancla)))::int - 1),
               (extract(year FROM age(hoy, ancla)) * 12 + extract(month FROM age(hoy, ancla)))::int + 1) n
       WHERE (ancla + make_interval(months => n))::date <= hoy) AS n
    FROM a WHERE ancla IS NOT NULL
  )
  SELECT (ancla + make_interval(months => COALESCE(n, 0)))::date,
         (ancla + make_interval(months => COALESCE(n, 0) + 1))::date
  FROM k
$$;

-- Tokens consumidos entre dos fechas locales [desde, hasta)
CREATE OR REPLACE FUNCTION bot_clima.tokens_entre(p_usuario_id bigint, p_desde date, p_hasta date) RETURNS integer
LANGUAGE sql STABLE AS $$
  SELECT count(*)::int
    FROM bot_clima.mensajes_salientes m,
         (SELECT bot_clima.cfg_texto('zona_horaria', 'America/La_Paz') AS z) t
   WHERE m.usuario_id = p_usuario_id
     AND m.estado <> 'failed'
     AND m.enviado_el >= (p_desde::timestamp AT TIME ZONE t.z)
     AND m.enviado_el <  (p_hasta::timestamp AT TIME ZONE t.z)
$$;

-- Estado del ciclo actual. Para n8n: SELECT restantes FROM bot_clima.tokens_ciclo(<usuario_id>)
CREATE OR REPLACE FUNCTION bot_clima.tokens_ciclo(p_usuario_id bigint)
RETURNS TABLE (inicio date, fin date, usados integer, limite integer, restantes integer)
LANGUAGE sql STABLE AS $$
  SELECT c.inicio, c.fin, u.usados, l.limite, GREATEST(l.limite - u.usados, 0)
    FROM bot_clima.ciclo_tokens(p_usuario_id) c,
         LATERAL (SELECT bot_clima.tokens_entre(p_usuario_id, c.inicio, c.fin) AS usados) u,
         LATERAL (SELECT bot_clima.limite_tokens(p_usuario_id) AS limite) l
$$;
