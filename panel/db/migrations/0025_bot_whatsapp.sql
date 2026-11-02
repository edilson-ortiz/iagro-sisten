-- =====================================================================
-- 0025 · Bot de WhatsApp sin IA (flujo n8n "IAGRO · Bot WhatsApp")
-- Responde con mensajes de servicio (imagen + texto + botones) usando el pronóstico
-- de la API IAGRO que le prepara el panel (/panel/api/whatsapp/pronostico).
-- =====================================================================

-- Token que n8n manda al panel para pedir el pronóstico (el panel limita las consultas a la API IAGRO)
INSERT INTO bot_clima.configuracion (clave, valor, tipo, grupo, etiqueta, descripcion, orden)
VALUES ('wa_api_token', to_jsonb(md5(random()::text || clock_timestamp()::text) || md5(random()::text)),
        'secreto', 'integraciones', 'Token del bot de WhatsApp (n8n → panel)',
        'Lo usa el flujo "IAGRO · Bot WhatsApp" para pedir el pronóstico al panel.', 60)
ON CONFLICT DO NOTHING;

-- Para el flujo: guarda lo que llegó (código de invitación, ubicación compartida) y devuelve el cliente.
--   p_codigo_invitado: "Quiero alertas IAgro CÓDIGO" de alguien que aún no está registrado
--   p_lat/p_lon: ubicación compartida con 📎 → registra al cliente o actualiza su lote
CREATE OR REPLACE FUNCTION bot_clima.wa_cliente(
  p_telefono text, p_nombre text, p_lat double precision, p_lon double precision, p_codigo_invitado text
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_tel      text := regexp_replace(coalesce(p_telefono, ''), '[^0-9]', '', 'g');
  v_r        jsonb;
  v_guardada boolean := false;
  v_nuevo    boolean := false;
  v_u        bot_clima.usuarios;
BEGIN
  IF length(v_tel) < 8 THEN RETURN NULL; END IF;

  IF nullif(trim(p_codigo_invitado), '') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM bot_clima.usuarios WHERE telefono = v_tel) THEN
    PERFORM bot_clima.registro_chat_guardar(v_tel, 'ESPERANDO_UBICACION', 'fc', NULL, NULL, p_codigo_invitado);
  END IF;

  IF p_lat IS NOT NULL AND p_lon IS NOT NULL THEN
    v_r := bot_clima.registrar_desde_chat(v_tel, nullif(trim(p_nombre), ''), p_lat, p_lon, NULL, 'pin', NULL);
    v_guardada := true;
    v_nuevo := coalesce((v_r->>'es_nuevo')::boolean, false);
  END IF;

  SELECT * INTO v_u FROM bot_clima.usuarios WHERE telefono = v_tel;
  RETURN jsonb_build_object(
    'id', v_u.id, 'nombre', v_u.nombre, 'zona', v_u.zona, 'lat', v_u.latitud, 'lon', v_u.longitud,
    'ubicacion_guardada', v_guardada, 'nuevo', v_nuevo);
END $$;
