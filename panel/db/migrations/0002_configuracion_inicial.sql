-- =====================================================================
-- 0002 · Valores iniciales de configuración y plan base
-- Todo esto se edita después desde el panel (Configuración / Planes).
-- ON CONFLICT DO NOTHING: nunca pisa valores ya editados.
-- =====================================================================

INSERT INTO bot_clima.configuracion (clave, valor, tipo, grupo, etiqueta, descripcion, orden) VALUES
-- General
('zona_horaria',              '"America/La_Paz"', 'texto',    'general',      'Zona horaria',                         'Zona horaria para fechas de vencimiento y horarios de envío.', 1),

-- Suscripción
('prueba_dias',               '30',               'numero',   'suscripcion',  'Días de prueba gratis',                'Días de prueba que recibe un usuario nuevo al registrarse.', 10),
('pago_dias',                 '30',               'numero',   'suscripcion',  'Días por pago (predeterminado)',       'Días que se suman al marcar un pago sin plan seleccionado.', 11),
('moneda',                    '"BOB"',            'texto',    'suscripcion',  'Moneda',                               'Código de moneda para montos (BOB, USD...).', 12),

-- Alerta de lluvia
('lluvia_activa',             'true',             'booleano', 'lluvia',       'Alertas de lluvia activas',            'Interruptor general de las alertas automáticas de lluvia.', 20),
('lluvia_umbral',             '60',               'numero',   'lluvia',       'Umbral de probabilidad (%)',           'Se envía alerta si la probabilidad de lluvia supera este valor.', 21),
('lluvia_horas_anticipacion', '24',               'numero',   'lluvia',       'Horas de anticipación',                'Se revisa la probabilidad de la hora que está exactamente a estas horas.', 22),
('lluvia_dias_bloqueo',       '7',                'numero',   'lluvia',       'Días entre alertas por usuario',       'Máximo una alerta de lluvia cada N días por usuario.', 23),
('lluvia_hora_desde',         '"06:00"',          'hora',     'lluvia',       'Enviar alertas desde',                 'No se envían alertas antes de esta hora local.', 24),
('lluvia_hora_hasta',         '"20:00"',          'hora',     'lluvia',       'Enviar alertas hasta',                 'No se envían alertas después de esta hora local.', 25),
('lluvia_agrupar_km',         '10',               'numero',   'lluvia',       'Agrupar ubicaciones cercanas (km)',    'Usuarios a menos de esta distancia comparten una sola consulta a Open-Meteo.', 26),

-- Vencimientos
('vencimiento_hora',          '"07:00"',          'hora',     'vencimientos', 'Hora del control diario',              'Hora local en la que se marcan los vencidos.', 30),
('aviso_vencimiento_activo',  'false',            'booleano', 'vencimientos', 'Avisar antes del vencimiento',         'Envía un aviso por WhatsApp unos días antes de que venza el plan.', 31),
('aviso_vencimiento_dias',    '3',                'numero',   'vencimientos', 'Días de anticipación del aviso',       'Cuántos días antes del vencimiento se avisa.', 32),

-- WhatsApp / Chatwoot
('chatwoot_url_publica',      '"https://chat.iagro360.xyz"', 'texto', 'whatsapp', 'URL de Chatwoot',            'Para los enlaces "ver conversación" del panel.', 40),
('chatwoot_account_id',       '2',                'numero',   'whatsapp',     'ID de cuenta de Chatwoot',             'Cuenta de Chatwoot donde está el inbox de WhatsApp.', 41),
('chatwoot_inbox_id',         '0',                'numero',   'whatsapp',     'ID del inbox de WhatsApp',             'Necesario para abrir conversaciones nuevas (difusiones y alertas). Lo ves en Chatwoot → Configuración → Inboxes.', 42),
('plantilla_lluvia',          '"alerta_lluvia"',  'texto',    'whatsapp',     'Plantilla de alerta de lluvia',        'Nombre exacto de la plantilla aprobada por Meta. Variables: {{1}} nombre, {{2}} hora, {{3}} probabilidad.', 43),
('plantilla_vencimiento',     '"aviso_vencimiento"', 'texto', 'whatsapp',     'Plantilla de aviso de vencimiento',    'Variables: {{1}} nombre, {{2}} fecha de vencimiento.', 44),
('plantilla_difusion',        '"difusion_general"',  'texto', 'whatsapp',     'Plantilla para difusiones',            'Plantilla con una variable {{1}} que lleva el texto de la difusión.', 45),
('plantilla_idioma',          '"es"',             'texto',    'whatsapp',     'Idioma de las plantillas',             'Código de idioma con que se aprobaron las plantillas (es, es_MX...).', 46),

-- Difusiones
('respuesta_ventana_dias',    '3',                'numero',   'difusiones',   'Ventana de respuesta (días)',          'Un mensaje entrante dentro de estos días después de una difusión cuenta como respuesta.', 50),
('difusion_pausa_ms',         '1200',             'numero',   'difusiones',   'Pausa entre envíos (ms)',              'Espera entre mensajes para no saturar WhatsApp.', 51),

-- Mensajes del bot ({nombre}, {zona}, {dias}, {vence_el} se reemplazan automáticamente)
('msg_bienvenida',            '"¡Hola {nombre}! 👋 Soy *IAGRO*, tu asistente del clima para el campo 🌾\n\nPara enviarte alertas de lluvia y el pronóstico de tu campo necesito tu ubicación."', 'texto_largo', 'mensajes', 'Bienvenida (usuario nuevo)', NULL, 60),
('msg_pedir_ubicacion',       '"📍 Compárteme la *ubicación de tu campo*: toca 📎 → *Ubicación* → *Enviar mi ubicación actual*.\n\nSi no estás en el campo, escribe el nombre de tu comunidad o municipio (ej: _San Julián_)."', 'texto_largo', 'mensajes', 'Pedir ubicación', NULL, 61),
('msg_registro_ok',           '"✅ ¡Listo, {nombre}! Registré tu campo en *{zona}*.\n\n🎁 Tienes *{dias} días de prueba gratis* (hasta el {vence_el}). Te avisaré cuando se acerque la lluvia 🌧️\n\nEscribe *Menú* para ver todo lo que puedo hacer."', 'texto_largo', 'mensajes', 'Registro completado', NULL, 62),
('msg_vencido',               '"⏰ Hola {nombre}, tu suscripción a *IAGRO* venció el {vence_el}.\n\nPara seguir recibiendo alertas de lluvia y pronósticos, comunícate con nosotros para renovar. 🌾"', 'texto_largo', 'mensajes', 'Suscripción vencida', NULL, 63),
('msg_aviso_vencimiento',     '"🔔 Hola {nombre}, tu suscripción a *IAGRO* vence el {vence_el}. Renueva para no dejar de recibir tus alertas de lluvia 🌧️"', 'texto_largo', 'mensajes', 'Aviso antes de vencer', 'Se usa como texto libre cuando el usuario escribió en las últimas 24 h; si no, se usa la plantilla.', 64)
ON CONFLICT (clave) DO NOTHING;

INSERT INTO bot_clima.planes (nombre, descripcion, dias, monto, moneda, orden)
SELECT 'Mensual', 'Alertas de lluvia y pronóstico por 30 días', 30, 0, 'BOB', 1
WHERE NOT EXISTS (SELECT 1 FROM bot_clima.planes);
