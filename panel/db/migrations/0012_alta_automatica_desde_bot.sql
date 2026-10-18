-- =====================================================================
-- 0012 · Alta automática en el panel de los usuarios que registra el bot
-- El bot de n8n ("Insertar Nuevo Usuario") crea el cliente solo en
-- public.users. Este trigger lo crea también en bot_clima.usuarios (en
-- prueba gratis) para que aparezca en el panel, reciba alertas y cuente
-- tokens, sin depender de cómo esté armado el bot.
-- =====================================================================

CREATE OR REPLACE FUNCTION bot_clima.alta_desde_users() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_tel text := regexp_replace(COALESCE(NEW.phone_number, ''), '[^0-9]', '', 'g');
BEGIN
  IF v_tel = '' THEN
    RETURN NEW;
  END IF;

  INSERT INTO bot_clima.usuarios (id, telefono, nombre, latitud, longitud, ubicacion_origen,
                                  fecha_registro, estado, vence_el, activo)
  VALUES (NEW.id, v_tel, NULLIF(trim(NEW.nombre_propiedad), ''),
          CASE WHEN NEW.latitude  BETWEEN -90  AND 90  THEN NEW.latitude  END,
          CASE WHEN NEW.longitude BETWEEN -180 AND 180 THEN NEW.longitude END,
          'web', now(), 'prueba', bot_clima.hoy() + bot_clima.cfg_num('prueba_dias', 30)::int,
          COALESCE(NEW.is_active, true))
  ON CONFLICT DO NOTHING;

  IF NOT FOUND THEN
    -- Mismo teléfono ya registrado en el panel con otro id: no se duplica, queda avisado
    PERFORM bot_clima.log('aviso', 'alta:bot', 'Usuario del bot no copiado al panel: el teléfono ya existe',
                          jsonb_build_object('users_id', NEW.id, 'telefono', v_tel));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_users_alta_panel ON public.users;
CREATE TRIGGER trg_users_alta_panel AFTER INSERT ON public.users
  FOR EACH ROW EXECUTE FUNCTION bot_clima.alta_desde_users();

-- registrar_usuario: con el trigger, la fila del panel ya existe al insertar en public.users;
-- "es_nuevo" ahora se basa en si se creó el usuario en public.users
CREATE OR REPLACE FUNCTION bot_clima.registrar_usuario(
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
  v_tel     text := regexp_replace(p_telefono, '[^0-9]', '', 'g');
  v_id      bigint;
  v_dias    integer := bot_clima.cfg_num('prueba_dias', 30)::int;
  v_nuevo   boolean := false;
BEGIN
  IF v_tel = '' THEN
    RAISE EXCEPTION 'Teléfono vacío';
  END IF;

  SELECT id INTO v_id FROM public.users WHERE phone_number = v_tel;
  IF v_id IS NULL THEN
    INSERT INTO public.users (phone_number, sensor_code, is_active, latitude, longitude, nombre_propiedad)
    VALUES (v_tel, 'EP999', true, p_latitud, p_longitud, p_nombre)
    RETURNING id INTO v_id;
    v_nuevo := true;
  ELSE
    UPDATE public.users
       SET latitude = COALESCE(p_latitud, latitude),
           longitude = COALESCE(p_longitud, longitude),
           nombre_propiedad = COALESCE(nombre_propiedad, p_nombre),
           updated_at = now()
     WHERE id = v_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM bot_clima.usuarios WHERE id = v_id) THEN
    INSERT INTO bot_clima.usuarios (id, chatwoot_contact_id, telefono, nombre, latitud, longitud, zona,
                                    ubicacion_origen, estado, vence_el)
    VALUES (v_id, p_chatwoot_contact_id, v_tel, p_nombre, p_latitud, p_longitud, p_zona,
            p_origen, 'prueba', bot_clima.hoy() + v_dias);
    v_nuevo := true;
  ELSE
    UPDATE bot_clima.usuarios
       SET latitud = COALESCE(p_latitud, latitud),
           longitud = COALESCE(p_longitud, longitud),
           zona = COALESCE(p_zona, zona),
           ubicacion_origen = COALESCE(p_origen, ubicacion_origen),
           nombre = COALESCE(nombre, p_nombre),
           chatwoot_contact_id = COALESCE(p_chatwoot_contact_id, chatwoot_contact_id)
     WHERE id = v_id;
  END IF;

  RETURN QUERY
  SELECT u.id, v_nuevo, u.vence_el, v_dias FROM bot_clima.usuarios u WHERE u.id = v_id;
END $$;
