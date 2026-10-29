-- =====================================================================
-- 0024 · Número nuevo de WhatsApp para las invitaciones (76783965)
-- El enlace que comparte el cliente desde "📤 Invitar amigos" es wa.me/{whatsapp_numero}.
-- Se puede volver a cambiar en el panel → Configuración → WhatsApp y Chatwoot.
-- =====================================================================

UPDATE bot_clima.configuracion
   SET valor = '"59176783965"', updated_at = now()
 WHERE clave = 'whatsapp_numero';
