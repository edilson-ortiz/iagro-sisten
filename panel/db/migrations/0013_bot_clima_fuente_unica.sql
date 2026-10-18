-- =====================================================================
-- 0013 · bot_clima.usuarios es la fuente única de los datos del cliente
-- El panel, la plantilla de alertas, el radar y (desde ahora) el bot leen
-- nombre, ubicación y estado de bot_clima.usuarios. public.users queda como
-- tabla histórica del registro (rain_records depende de ella).
-- Una sola vez: public.users toma los valores del panel donde difieren.
-- =====================================================================

UPDATE public.users u
   SET nombre_propiedad = b.nombre,
       latitude  = COALESCE(b.latitud, u.latitude),
       longitude = COALESCE(b.longitud, u.longitude),
       is_active = b.activo,
       updated_at = now()
  FROM bot_clima.usuarios b
 WHERE b.id = u.id
   AND (u.nombre_propiedad IS DISTINCT FROM b.nombre
        OR (b.latitud IS NOT NULL AND u.latitude IS DISTINCT FROM b.latitud)
        OR (b.longitud IS NOT NULL AND u.longitude IS DISTINCT FROM b.longitud)
        OR u.is_active IS DISTINCT FROM b.activo);

SELECT bot_clima.log('info', 'migracion:0013', 'public.users igualada con bot_clima.usuarios', NULL);
