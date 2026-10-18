-- =====================================================================
-- Script único (NO es migración): todos los usuarios vuelven a empezar hoy
-- con la prueba gratis.
--   · fecha de registro = ahora
--   · estado = prueba, vence = hoy + "Días de prueba gratis" (Configuración)
--   · el ciclo de tokens arranca hoy
-- No borra pagos, alertas ni mensajes (quedan como historial) y no cambia
-- si el usuario está activo o inactivo.
-- Requiere la migración 0009 aplicada antes.
--
-- Uso:  psql "<DATABASE_URL de producción>" -f 2026-10-13_reiniciar_prueba_gratis.sql
-- =====================================================================

BEGIN;

CREATE TEMP TABLE ids_reinicio (id bigint PRIMARY KEY) ON COMMIT DROP;
INSERT INTO ids_reinicio VALUES
  (1), (2), (3), (4), (5), (7), (9), (10), (11), (12), (13), (14), (15), (16), (17), (18),
  (20), (21), (22), (25), (26), (27), (28), (29), (30), (40), (41), (42), (43), (45),
  (46), (47), (48), (49), (50), (51), (52);

-- Ids de la lista que no existen en bot_clima.usuarios (solo informativo)
SELECT i.id AS id_no_encontrado
  FROM ids_reinicio i
 WHERE NOT EXISTS (SELECT 1 FROM bot_clima.usuarios u WHERE u.id = i.id);

UPDATE bot_clima.usuarios u
   SET fecha_registro        = now(),
       estado                = 'prueba',
       vence_el              = bot_clima.hoy() + bot_clima.cfg_num('prueba_dias', 30)::int,
       aviso_vencimiento_el  = NULL
  FROM ids_reinicio i
 WHERE u.id = i.id;

SELECT bot_clima.log('info', 'script:reinicio-prueba', 'Usuarios reiniciados a prueba gratis desde hoy',
       jsonb_build_object('usuarios', (SELECT count(*) FROM ids_reinicio), 'fecha', bot_clima.hoy()));

-- Resultado
SELECT u.id, u.nombre, u.estado, u.activo,
       (u.fecha_registro AT TIME ZONE bot_clima.cfg_texto('zona_horaria', 'America/La_Paz'))::date AS registro,
       u.vence_el, t.inicio AS ciclo_desde, t.fin AS tokens_se_renuevan, t.usados, t.limite
  FROM bot_clima.usuarios u
  JOIN ids_reinicio i ON i.id = u.id
  CROSS JOIN LATERAL bot_clima.tokens_ciclo(u.id) t
 ORDER BY u.id;

COMMIT;
