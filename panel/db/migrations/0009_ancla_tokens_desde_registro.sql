-- =====================================================================
-- 0009 · El ciclo de tokens nunca empieza antes del registro
-- Si se reinicia la fecha de registro de un usuario (ej: todos vuelven a
-- prueba gratis), sus pagos anteriores ya no mueven el inicio del ciclo.
-- =====================================================================

CREATE OR REPLACE FUNCTION bot_clima.ancla_tokens(p_usuario_id bigint, p_fecha date DEFAULT NULL) RETURNS date
LANGUAGE sql STABLE AS $$
  WITH z AS (SELECT bot_clima.cfg_texto('zona_horaria', 'America/La_Paz') AS z, COALESCE(p_fecha, bot_clima.hoy()) AS hoy)
  SELECT COALESCE(
    -- último pago hecho con la suscripción ya vencida (posterior al registro): reinicia el ciclo
    (SELECT max((p.fecha AT TIME ZONE z.z)::date)
       FROM bot_clima.pagos p
      WHERE p.usuario_id = p_usuario_id
        AND p.vence_anterior < (p.fecha AT TIME ZONE z.z)::date
        AND (p.fecha AT TIME ZONE z.z)::date >= (u.fecha_registro AT TIME ZONE z.z)::date
        AND (p.fecha AT TIME ZONE z.z)::date <= z.hoy),
    (u.fecha_registro AT TIME ZONE z.z)::date)
  FROM bot_clima.usuarios u, z
  WHERE u.id = p_usuario_id
$$;
