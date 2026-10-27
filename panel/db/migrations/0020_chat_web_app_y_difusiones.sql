-- =====================================================================
-- 0020 · Quién usa el chat web y difusiones por notificación push
-- chat_web_clientes: una fila por teléfono que abrió el chat (y si instaló la app).
-- chat_web_difusiones: historial de notificaciones enviadas desde el panel.
-- =====================================================================

CREATE TABLE IF NOT EXISTS bot_clima.chat_web_clientes (
  telefono          varchar(20)  PRIMARY KEY,
  primera_visita_el timestamptz  NOT NULL DEFAULT now(),
  ultima_visita_el  timestamptz  NOT NULL DEFAULT now(),
  visitas           int          NOT NULL DEFAULT 1,
  instalada_el      timestamptz,
  plataforma        varchar(20)
);

-- Quien ya activó las notificaciones antes de esta migración también abrió el chat
INSERT INTO bot_clima.chat_web_clientes (telefono, primera_visita_el, ultima_visita_el)
SELECT telefono, min(creado_el), max(creado_el) FROM bot_clima.chat_web_push GROUP BY telefono
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS bot_clima.chat_web_difusiones (
  id            serial       PRIMARY KEY,
  titulo        varchar(80)  NOT NULL,
  texto         text         NOT NULL,
  segmento      varchar(20)  NOT NULL,
  destinatarios int          NOT NULL DEFAULT 0,
  enviados      int          NOT NULL DEFAULT 0,
  fallidos      int          NOT NULL DEFAULT 0,
  admin         varchar(120),
  creado_el     timestamptz  NOT NULL DEFAULT now()
);
