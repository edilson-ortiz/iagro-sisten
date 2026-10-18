-- =====================================================================
-- 0016 · Botón "⛈️ Lluvias fuertes" (título corto)
-- WhatsApp rechaza títulos de botón de más de 20 caracteres (#131009): el botón de la
-- confirmación de baja pasó de "⛈️ Solo lluvias fuertes" a "⛈️ Lluvias fuertes".
-- registrar_respuesta acepta los dos textos (igual a la 0015 salvo esa línea).
-- =====================================================================

CREATE OR REPLACE FUNCTION bot_clima.registrar_respuesta(
  p_telefono     text,
  p_fecha        timestamptz DEFAULT now(),
  p_contenido    text        DEFAULT NULL,
  p_in_reply_to  bigint      DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_tel    text := regexp_replace(p_telefono, '[^0-9]', '', 'g');
  v_texto  text := lower(btrim(regexp_replace(COALESCE(p_contenido, ''), '\s+', ' ', 'g')));
  v_resp   text := left(btrim(COALESCE(p_contenido, '')), 200);
  v_uid    bigint;
  v_dias   integer := bot_clima.cfg_num('respuesta_ventana_dias', 3)::int;
  v_alerta bigint;
  v_accion text;
  n1 integer := 0; n2 integer := 0;
BEGIN
  v_texto := regexp_replace(v_texto, '^[^a-z0-9áéíóúñ]+', '');   -- "⛈️ Solo lluvias fuertes" → "solo lluvias fuertes"
  SELECT id INTO v_uid FROM bot_clima.usuarios WHERE telefono = v_tel;

  -- Lista de bajas (vale también para contactos de difusiones que no son clientes)
  IF v_texto IN ('dejar de recibir', 'no recibir alertas', 'desactivar alertas') THEN
    INSERT INTO bot_clima.bajas_whatsapp (telefono) VALUES (v_tel) ON CONFLICT DO NOTHING;
  ELSIF v_texto IN ('alta', 'activar alertas', 'recibir alertas') THEN
    DELETE FROM bot_clima.bajas_whatsapp WHERE telefono = v_tel;
  END IF;

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('usuario_id', NULL, 'marcadas', 0, 'accion',
      CASE WHEN v_texto IN ('dejar de recibir', 'no recibir alertas', 'desactivar alertas') THEN 'baja_contacto'
           WHEN v_texto IN ('alta', 'activar alertas', 'recibir alertas') THEN 'alta_contacto' END);
  END IF;

  UPDATE bot_clima.usuarios
     SET ultimo_mensaje_el = GREATEST(COALESCE(ultimo_mensaje_el, p_fecha), p_fecha)
   WHERE id = v_uid;

  UPDATE bot_clima.difusion_envios e
     SET respondio = true, respondio_el = p_fecha,
         entregado = true, entregado_el = COALESCE(e.entregado_el, p_fecha),
         leido = true, leido_el = COALESCE(e.leido_el, p_fecha)
   WHERE e.id = (
     SELECT id FROM bot_clima.difusion_envios
      WHERE usuario_id = v_uid AND enviado AND NOT respondio
        AND enviado_el BETWEEN p_fecha - make_interval(days => v_dias) AND p_fecha
      ORDER BY enviado_el DESC LIMIT 1);
  GET DIAGNOSTICS n1 = ROW_COUNT;

  IF p_in_reply_to IS NOT NULL THEN
    SELECT id INTO v_alerta FROM bot_clima.alertas_enviadas
     WHERE usuario_id = v_uid AND chatwoot_message_id = p_in_reply_to;
  END IF;
  IF v_alerta IS NULL THEN
    SELECT id INTO v_alerta FROM bot_clima.alertas_enviadas
     WHERE usuario_id = v_uid AND respondio_el IS NULL AND estado <> 'fallido'
       AND enviada_el BETWEEN p_fecha - make_interval(days => v_dias) AND p_fecha
     ORDER BY enviada_el DESC LIMIT 1;
  END IF;

  IF v_alerta IS NOT NULL THEN
    UPDATE bot_clima.alertas_enviadas a
       SET respondio_el = COALESCE(a.respondio_el, p_fecha),
           respuesta    = COALESCE(a.respuesta, NULLIF(v_resp, '')),
           estado       = CASE WHEN a.estado = 'fallido' THEN a.estado ELSE 'leido' END,
           entregado_el = COALESCE(a.entregado_el, p_fecha),
           leido_el     = COALESCE(a.leido_el, p_fecha)
     WHERE a.id = v_alerta;
    GET DIAGNOSTICS n2 = ROW_COUNT;
  END IF;

  IF v_texto IN ('dejar de recibir', 'no recibir alertas', 'desactivar alertas') THEN
    IF bot_clima.desactivar_alertas(v_uid, 'usuario') THEN
      v_accion := 'desactivado';
      PERFORM bot_clima.log('info', 'alertas', 'El usuario dejó de recibir alertas', jsonb_build_object('usuario_id', v_uid));
    END IF;
  ELSIF v_texto IN ('solo lluvias fuertes', 'lluvias fuertes') THEN
    UPDATE bot_clima.usuarios
       SET alertas_activas = true, alertas_nivel = 'fuertes', alertas_reactivado_el = now(),
           alertas_desactivadas_el = NULL, alertas_desactivadas_por = NULL
     WHERE id = v_uid;
    v_accion := 'fuertes';
    PERFORM bot_clima.log('info', 'alertas', 'El usuario eligió solo lluvias fuertes', jsonb_build_object('usuario_id', v_uid));
  ELSIF v_texto IN ('alta', 'activar alertas', 'recibir alertas') THEN
    IF NOT (SELECT alertas_activas AND alertas_nivel = 'todas' FROM bot_clima.usuarios WHERE id = v_uid) THEN
      PERFORM bot_clima.reactivar_alertas(v_uid);
      v_accion := 'reactivado';
      PERFORM bot_clima.log('info', 'alertas', 'El usuario reactivó sus alertas', jsonb_build_object('usuario_id', v_uid));
    END IF;
  END IF;

  RETURN jsonb_build_object('usuario_id', v_uid, 'marcadas', n1 + n2, 'accion', v_accion);
END $$;
