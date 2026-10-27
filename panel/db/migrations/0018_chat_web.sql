-- =====================================================================
-- 0018 · Chat web (/chat/{teléfono}): alternativa a WhatsApp con el mismo bot
-- Usa un inbox de Chatwoot de tipo API. El bot de n8n responde igual que en
-- WhatsApp porque identifica al cliente por el teléfono del contacto.
-- =====================================================================

INSERT INTO bot_clima.configuracion (clave, valor, tipo, grupo, etiqueta, descripcion, orden) VALUES
('chatwoot_web_inbox_id', '0', 'numero', 'whatsapp', 'ID del inbox del chat web',
 'Inbox de Chatwoot de tipo API para el chat web (/chat). Créalo en Chatwoot → Configuración → Inboxes → API (sin URL de webhook). 0 = chat web apagado.', 47)
ON CONFLICT DO NOTHING;
