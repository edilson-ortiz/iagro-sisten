-- =====================================================================
-- 0004 · Copia los usuarios existentes de public.users a bot_clima.usuarios
-- - Solo LEE public.users (no la modifica ni la borra).
-- - Todos empiezan en 'prueba' con los días de prueba configurados desde hoy.
-- - Idempotente: si un usuario ya existe en bot_clima, no se toca.
-- - Si dos filas comparten teléfono, se queda la más reciente.
-- =====================================================================

INSERT INTO bot_clima.usuarios (id, telefono, nombre, latitud, longitud, ubicacion_origen,
                                fecha_registro, estado, vence_el, activo)
SELECT DISTINCT ON (regexp_replace(u.phone_number, '[^0-9]', '', 'g'))
       u.id,
       regexp_replace(u.phone_number, '[^0-9]', '', 'g'),
       NULLIF(trim(u.nombre_propiedad), ''),
       CASE WHEN u.latitude  BETWEEN -90  AND 90  THEN u.latitude  END,
       CASE WHEN u.longitude BETWEEN -180 AND 180 THEN u.longitude END,
       'migracion',
       COALESCE(u.created_at AT TIME ZONE 'UTC', now()),  -- public.users guarda hora UTC sin zona
       'prueba',
       bot_clima.hoy() + bot_clima.cfg_num('prueba_dias', 30)::int,
       u.is_active
  FROM public.users u
 WHERE regexp_replace(u.phone_number, '[^0-9]', '', 'g') <> ''
   AND NOT EXISTS (SELECT 1 FROM bot_clima.usuarios b WHERE b.id = u.id)
   AND NOT EXISTS (SELECT 1 FROM bot_clima.usuarios b WHERE b.telefono = regexp_replace(u.phone_number, '[^0-9]', '', 'g'))
 ORDER BY regexp_replace(u.phone_number, '[^0-9]', '', 'g'), u.created_at DESC NULLS LAST, u.id DESC;

SELECT bot_clima.log('info', 'migracion:0004',
  'Usuarios copiados desde public.users',
  jsonb_build_object('total_bot_clima', (SELECT count(*) FROM bot_clima.usuarios)));
