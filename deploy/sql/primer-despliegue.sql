-- =====================================================================
-- Primer despliegue en producción (correr UNA vez, después de las migraciones)
--   sudo docker exec -i postgres psql -U postgres -d trd < sql/primer-despliegue.sql
--
-- 1. Inbox de WhatsApp de Chatwoot (id 5) para alertas y envíos.
-- 2. Todos los clientes empiezan HOY con la prueba gratis (fecha de registro = hoy,
--    vence en "Días de prueba gratis", ciclo de tokens desde hoy).
-- Si ya se corrió una vez, no vuelve a reiniciar a nadie.
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;

UPDATE bot_clima.configuracion SET valor = '5' WHERE clave = 'chatwoot_inbox_id' AND valor = '0';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM bot_clima.logs WHERE origen = 'despliegue:inicial') THEN
    RAISE NOTICE 'El reinicio de prueba gratis ya se hizo antes: no se repite.';
    RETURN;
  END IF;
  UPDATE bot_clima.usuarios
     SET fecha_registro = now(), estado = 'prueba', aviso_vencimiento_el = NULL,
         vence_el = bot_clima.hoy() + bot_clima.cfg_num('prueba_dias', 30)::int;
  PERFORM bot_clima.log('info', 'despliegue:inicial', 'Todos los usuarios en prueba gratis desde hoy',
                        jsonb_build_object('usuarios', (SELECT count(*) FROM bot_clima.usuarios), 'fecha', bot_clima.hoy()));
END $$;

SELECT count(*) AS usuarios, count(*) FILTER (WHERE activo) AS activos,
       min(vence_el) AS vencen_el, bot_clima.cfg_texto('chatwoot_inbox_id', '?') AS inbox_whatsapp
  FROM bot_clima.usuarios;

COMMIT;
