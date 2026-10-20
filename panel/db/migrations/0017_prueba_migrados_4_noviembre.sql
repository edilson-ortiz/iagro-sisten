-- =====================================================================
-- 0017 · La prueba gratis de los clientes migrados vence el 4 de noviembre de 2026
-- Migrados = los que reinició deploy/sql/primer-despliegue.sql (todos quedaron con la
-- misma fecha_registro, la del log 'despliegue:inicial'). Si no hubo ese reinicio
-- (base local), son los que vinieron de public.users (ubicacion_origen 'migracion').
-- Solo los que siguen en prueba: quien ya pagó o se registró después no se toca.
-- El ciclo de tokens no cambia (sigue contando desde fecha_registro).
-- =====================================================================

WITH reinicio AS (
  SELECT min(created_at) AS el FROM bot_clima.logs WHERE origen = 'despliegue:inicial'
),
u AS (
  UPDATE bot_clima.usuarios x
     SET vence_el = DATE '2026-11-04', aviso_vencimiento_el = NULL
    FROM reinicio r
   WHERE x.estado = 'prueba'
     AND CASE WHEN r.el IS NOT NULL THEN x.fecha_registro = r.el
              ELSE x.ubicacion_origen = 'migracion' END
  RETURNING x.id
)
SELECT bot_clima.log('info', 'migracion:0017', 'Prueba gratis de los migrados hasta el 4/11/2026',
                     jsonb_build_object('usuarios', (SELECT count(*) FROM u)));
