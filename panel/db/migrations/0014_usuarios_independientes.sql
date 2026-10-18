-- =====================================================================
-- 0014 · bot_clima.usuarios independiente de public.users
-- Desde ahora los clientes viven solo en bot_clima.usuarios:
--   · su id deja de depender de public.users (tiene su propia secuencia)
--   · las lluvias (public.rain_records) apuntan a bot_clima.usuarios
--   · el registro (bot de n8n y panel) crea el cliente directo en bot_clima
-- public.users queda como tabla histórica: ya no se lee ni se escribe.
-- Los ids actuales no cambian (radar /radar/{id}, lluvias y Chatwoot siguen igual).
-- =====================================================================

-- 1. id propio para los clientes nuevos (continúa después del mayor id usado en cualquiera de las dos tablas)
ALTER TABLE bot_clima.usuarios DROP CONSTRAINT IF EXISTS usuarios_id_fkey;
CREATE SEQUENCE IF NOT EXISTS bot_clima.usuarios_id_seq OWNED BY bot_clima.usuarios.id;
SELECT setval('bot_clima.usuarios_id_seq',
              GREATEST((SELECT COALESCE(max(id), 0) FROM bot_clima.usuarios),
                       (SELECT COALESCE(max(id), 0) FROM public.users), 1));
ALTER TABLE bot_clima.usuarios ALTER COLUMN id SET DEFAULT nextval('bot_clima.usuarios_id_seq');

-- 2. Lluvias → bot_clima.usuarios (si quedara alguna lluvia de un usuario que no está en el panel,
--    la regla se crea sin revisar las viejas para no perder datos; las nuevas sí se validan)
ALTER TABLE public.rain_records DROP CONSTRAINT IF EXISTS rain_records_user_id_fkey;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.rain_records r WHERE NOT EXISTS (SELECT 1 FROM bot_clima.usuarios b WHERE b.id = r.user_id)) THEN
    ALTER TABLE public.rain_records ADD CONSTRAINT rain_records_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES bot_clima.usuarios(id) ON DELETE CASCADE NOT VALID;
    PERFORM bot_clima.log('aviso', 'migracion:0014', 'Hay lluvias de usuarios que no están en el panel', NULL);
  ELSE
    ALTER TABLE public.rain_records ADD CONSTRAINT rain_records_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES bot_clima.usuarios(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 3. Ya no se copia desde public.users (nadie escribe ahí)
DROP TRIGGER IF EXISTS trg_users_alta_panel ON public.users;
DROP FUNCTION IF EXISTS bot_clima.alta_desde_users();

-- 4. Registro de un cliente: solo bot_clima.usuarios.
--    Lo usa el bot de n8n (código del sitio /registro) y puede usarlo cualquier alta futura.
--    Si el teléfono ya existe, actualiza ubicación y nombre vacío; no reinicia su plan.
DROP FUNCTION IF EXISTS bot_clima.registrar_usuario(text, text, double precision, double precision, text, text, bigint);
CREATE FUNCTION bot_clima.registrar_usuario(
  p_telefono            text,
  p_nombre              text,
  p_latitud             double precision,
  p_longitud            double precision,
  p_zona                text,
  p_origen              text,
  p_chatwoot_contact_id bigint DEFAULT NULL
) RETURNS TABLE (usuario_id bigint, es_nuevo boolean, vence_el date, dias_prueba integer)
LANGUAGE plpgsql AS $$
DECLARE
  v_tel   text := regexp_replace(COALESCE(p_telefono, ''), '[^0-9]', '', 'g');
  v_id    bigint;
  v_dias  integer := bot_clima.cfg_num('prueba_dias', 30)::int;
  v_nuevo boolean := false;
  v_lat   double precision := CASE WHEN p_latitud  BETWEEN -90  AND 90  THEN p_latitud  END;
  v_lon   double precision := CASE WHEN p_longitud BETWEEN -180 AND 180 THEN p_longitud END;
BEGIN
  IF v_tel = '' THEN
    RAISE EXCEPTION 'Teléfono vacío';
  END IF;

  SELECT id INTO v_id FROM bot_clima.usuarios WHERE telefono = v_tel;
  IF v_id IS NULL THEN
    INSERT INTO bot_clima.usuarios (telefono, chatwoot_contact_id, nombre, latitud, longitud, zona,
                                    ubicacion_origen, fecha_registro, estado, vence_el)
    VALUES (v_tel, p_chatwoot_contact_id, NULLIF(trim(p_nombre), ''), v_lat, v_lon, NULLIF(trim(p_zona), ''),
            p_origen, now(), 'prueba', bot_clima.hoy() + v_dias)
    RETURNING id INTO v_id;
    v_nuevo := true;
  ELSE
    UPDATE bot_clima.usuarios
       SET latitud = COALESCE(v_lat, latitud),
           longitud = COALESCE(v_lon, longitud),
           zona = COALESCE(NULLIF(trim(p_zona), ''), zona),
           nombre = COALESCE(nombre, NULLIF(trim(p_nombre), '')),
           chatwoot_contact_id = COALESCE(p_chatwoot_contact_id, chatwoot_contact_id)
     WHERE id = v_id;
  END IF;

  RETURN QUERY SELECT u.id, v_nuevo, u.vence_el, v_dias FROM bot_clima.usuarios u WHERE u.id = v_id;
END $$;

SELECT bot_clima.log('info', 'migracion:0014', 'Clientes independientes de public.users',
                     jsonb_build_object('usuarios', (SELECT count(*) FROM bot_clima.usuarios),
                                        'siguiente_id', (SELECT last_value + 1 FROM bot_clima.usuarios_id_seq)));
