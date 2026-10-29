-- =====================================================================
-- 0023 · Datos de la API de WhatsApp (Meta) para enviar el botón "Ver pronóstico"
-- directo, sin pasar por Chatwoot. El token NO va aquí: va en la credencial
-- "WhatsApp API" de n8n (Header Auth: Authorization = Bearer <token>).
-- =====================================================================

INSERT INTO bot_clima.configuracion (clave, valor, tipo, grupo, etiqueta, descripcion, orden) VALUES
('whatsapp_phone_number_id', '"1356446567560317"', 'texto', 'whatsapp', 'ID del número de WhatsApp (API de Meta)',
 'Phone number ID de WhatsApp Manager → Configuración de la API. Lo usa el flujo "WhatsApp → Chat web" para enviar el botón "Ver pronóstico".', 51),
('whatsapp_api_version', '"v25.0"', 'texto', 'whatsapp', 'Versión de la API de WhatsApp',
 'Versión de graph.facebook.com (ej. v25.0).', 52)
ON CONFLICT DO NOTHING;
