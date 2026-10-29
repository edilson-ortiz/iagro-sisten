-- =====================================================================
-- 0022 · "Ver pronóstico" pasa a ser un mensaje de servicio (botón de enlace "cta_url"
-- de la API de WhatsApp, dentro de las 24 h), no una plantilla: ya no hace falta su nombre.
-- =====================================================================

DELETE FROM bot_clima.configuracion WHERE clave = 'plantilla_chat_web';
