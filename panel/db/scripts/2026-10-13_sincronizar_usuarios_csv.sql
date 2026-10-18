-- =====================================================================
-- Script único: deja los usuarios EXACTAMENTE como el CSV de producción
-- (estacionesdata11.csv, 37 usuarios).
--   · Elimina los que no están en el CSV (ej: id 44 "Colcha", cuyo teléfono
--     59167225705 ahora es el id 52). Borra en cascada sus pagos, alertas,
--     pronósticos y mensajes.
--   · Agrega los nuevos (50, 51, 52) en prueba gratis desde hoy.
--   · Copia teléfono, nombre, coordenadas y activo/inactivo del CSV.
-- Todo en una transacción: si algo falla, no cambia nada.
--
-- Uso (base local de Docker), desde la carpeta ia-clima:
--   docker exec -i iagro-db psql -U postgres -d trd < panel/db/scripts/2026-10-13_sincronizar_usuarios_csv.sql
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE csv (id bigint PRIMARY KEY, phone_number varchar(20), sensor_code varchar(100), is_active boolean,
  latitude double precision, longitude double precision, created_at timestamp, updated_at timestamp, nombre_propiedad text) ON COMMIT DROP;
COPY csv FROM STDIN WITH (FORMAT csv);
15,59176098116,EP999,t,-16.008438,-62.450487,2026-06-23 13:12:22.488448,2026-06-23 13:12:22.488448,Javier
16,59171005845,EP999,t,-18.087118,-64.110298,2026-06-23 13:14:48.445416,2026-06-23 13:14:48.445416,Municipio pampagrande
1,59167875050,EP061,t,-16.396213,-63.136737,2026-06-05 23:59:20.22967,2026-06-05 23:59:20.22967,Nucleo 50
3,59176006370,EP055,t,-17.222688,-63.455103,2026-06-09 01:18:26.960889,2026-06-09 01:18:26.960889,El Carmen de Ovando
4,59172940060,EP999,t,-21.66977,-63.41168,2026-06-10 01:11:40.542149,2026-06-10 01:11:40.542149,Jame Alvarado Palacios
5,59173693168,EP999,t,-16.593905,-63.863428,2026-06-10 11:23:13.155741,2026-06-10 11:23:13.155741,Agro forestal Bolívar
9,59163382875,EP999,t,-16.501906,-62.97949,2026-06-11 00:25:10.694257,2026-06-11 00:25:10.694257,Comunidad oriental Núcleo 39
11,59177622357,EP999,t,-17.275094,-62.560225,2026-06-15 01:11:25.876725,2026-06-15 01:11:25.876725,Cuatro cañada
12,59177030170,EP999,t,-16.084744,-62.074551,2026-06-15 01:12:10.857047,2026-06-15 01:12:10.857047,Propiedad La Pailita
13,59178039416,EP999,t,-16.882971,-63.819725,2026-06-16 01:26:35.697585,2026-06-16 01:26:35.697585,Colonia 5
14,59173196276,EP999,t,-17.405433,-63.888044,2026-06-16 01:28:26.845139,2026-06-16 01:28:26.845139,Yapacani
2,59167816051,EP999,f,-17.853,-63.079,2026-06-05 23:59:59.678949,2026-06-05 23:59:59.678949,Iagro Santa cruz
41,59169277110,EP999,t,-16.4129508,-63.799315,2026-09-11 02:10:28.887753,2026-09-11 02:10:28.887753,Don Mario propiedad
40,59176871405,EP999,t,-17.7833,-63.1821,2026-09-09 11:44:18.428168,2026-09-09 11:44:18.428168,IAGRO SANTA CRUZ
18,59163188702,EP999,t,-16.308488,-67.619493,2026-07-22 12:42:45.477413,2026-07-22 12:42:45.477413,Coripata nor yungas
7,59174059377,EP999,t,-15.586876,-67.250333,2026-06-11 00:08:38.344335,2026-06-11 00:08:38.344335,Municipio Palos blancos
17,59167760053,EP999,f,-20.429568,-63.272168,2026-06-23 13:17:25.407132,2026-06-23 13:17:25.407132,Boyuibe
21,59173169245,EP999,t,-17.853,-63.079,2026-08-21 02:50:11.712106,2026-08-21 02:50:11.712106,Iagro Santa cruz
25,59167241775,EP999,t,-19.3214,-67.3121,2026-06-05 23:59:20.22967,2026-06-05 23:59:20.22967,Comunidad Aroma
26,59173547528,EP999,t,-15.8534,-68.9454,2026-06-05 23:59:20.22967,2026-06-05 23:59:20.22967,Lote de Oswaldo
27,59174445371,EP999,t,-16.839,-66.6301,2026-06-05 23:59:20.22967,2026-06-05 23:59:20.22967,Choquemata
28,59164125279,EP999,t,-17.6489,-67.2096,2026-06-05 23:59:20.22967,2026-06-05 23:59:20.22967,Caracollo
30,59170053323,EP099,t,-16.744006,-63.292083,2026-09-06 17:44:13.145961,2026-09-06 17:44:13.145961,Propiedad campo verde
22,59176494329,EP999,t,-17.003624,-65.060309,2026-08-23 23:22:43.803388,2026-08-23 23:22:43.803388,Maripoza
29,59177076761,EP999,t,-17.675,-63.366,2026-09-01 00:04:10.661568,2026-09-01 00:04:10.661568,Terevinto
42,59164934727,EP999,t,-17.05672420146256,-64.89505540884817,2026-09-12 23:01:24.6274,2026-09-12 23:01:24.6274,Tamborada
43,59163549027,EP999,t,-17.823916568153766,-63.06625699819009,2026-09-30 00:39:26.758808,2026-09-30 00:39:26.758808,La Madre
45,59168445335,EP999,t,-17.595507112918234,-66.19705796241762,2026-09-30 12:26:48.163259,2026-09-30 12:26:48.163259,Chiñata
10,59175004444,EP999,f,-17.473698,-61.876286,2026-06-15 01:09:17.785703,2026-06-15 01:09:17.785703,Fernando
20,59173965911,EP999,t,-18.163925,-63.509186,2026-07-22 12:44:22.996176,2026-07-22 12:44:22.996176,Angostura
46,59167182059,EP999,t,-14.8349438,-64.9044936,2026-10-02 12:43:17.765005,2026-10-02 12:43:17.765005,Villa Marín
47,59163394421,EP999,t,-17.0337524,-64.8575169,2026-10-07 02:30:35.436663,2026-10-07 02:30:35.436663,Ivirgsrzama
48,59172887082,EP999,t,-17.198503006131748,-64.53942522843015,2026-10-07 14:38:46.413787,2026-10-07 14:38:46.413787,Venta de plantas
49,59171324504,EP999,t,-15.29362351708826,-63.8309154509625,2026-10-08 09:40:42.697382,2026-10-08 09:40:42.697382,Ever oretea
50,59172566709,EP999,t,-19.27728625994647,-67.60059893131258,2026-10-10 01:34:17.931385,2026-10-10 01:34:17.931385,San martín provincia ladislao cabrera salinas de garcimendoza
52,59167225705,EP999,t,-19.198013,-67.532292,2026-10-12 23:53:49.369304,2026-10-12 23:53:49.369304,San Martin oruro de la provincia Ladislao cabrera
51,59168704411,EP999,t,-19.083687,-65.24244,2026-10-11 23:42:14.088615,2026-10-11 23:42:14.088615,Sucre azari
\.

-- Vista previa de lo que se elimina y se crea
SELECT 'eliminar' AS accion, id, nombre FROM bot_clima.usuarios WHERE id NOT IN (SELECT id FROM csv)
UNION ALL
SELECT 'crear', id, nombre_propiedad FROM csv WHERE id NOT IN (SELECT id FROM public.users);

-- 1. Eliminados en producción
DELETE FROM bot_clima.usuarios WHERE id NOT IN (SELECT id FROM csv);
DELETE FROM public.users WHERE id NOT IN (SELECT id FROM csv);

-- 2. public.users idéntico al CSV
INSERT INTO public.users (id, phone_number, sensor_code, is_active, latitude, longitude, created_at, updated_at, nombre_propiedad)
SELECT id, phone_number, sensor_code, is_active, latitude, longitude, created_at, updated_at, nombre_propiedad FROM csv
ON CONFLICT (id) DO UPDATE SET phone_number = EXCLUDED.phone_number, sensor_code = EXCLUDED.sensor_code, is_active = EXCLUDED.is_active,
  latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at,
  nombre_propiedad = EXCLUDED.nombre_propiedad;
SELECT setval('public.users_id_seq', (SELECT max(id) FROM public.users));

-- 3. Usuarios del bot con los datos del CSV
UPDATE bot_clima.usuarios u
   SET telefono = c.phone_number, nombre = c.nombre_propiedad, latitud = c.latitude, longitud = c.longitude, activo = c.is_active
  FROM csv c WHERE c.id = u.id;

-- 4. Nuevos: prueba gratis desde hoy
INSERT INTO bot_clima.usuarios (id, telefono, nombre, latitud, longitud, ubicacion_origen, fecha_registro, estado, vence_el, activo)
SELECT id, phone_number, nombre_propiedad, latitude, longitude, 'migracion', now(), 'prueba',
       bot_clima.hoy() + bot_clima.cfg_num('prueba_dias', 30)::int, is_active
  FROM csv WHERE id NOT IN (SELECT id FROM bot_clima.usuarios);

SELECT bot_clima.log('info', 'script:sincronizar-csv', 'Usuarios sincronizados con el CSV de producción',
       jsonb_build_object('usuarios', (SELECT count(*) FROM csv)));

-- Resultado
SELECT (SELECT count(*) FROM public.users)                           AS users,
       (SELECT count(*) FROM bot_clima.usuarios)                     AS usuarios_bot,
       (SELECT count(*) FROM bot_clima.usuarios WHERE activo)        AS activos,
       (SELECT count(*) FROM bot_clima.usuarios WHERE estado = 'prueba') AS en_prueba;

COMMIT;
