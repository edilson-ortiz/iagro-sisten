-- =====================================================================
-- 0019 · Notificaciones push del chat web (Chrome, Edge, Firefox, Safari con la app instalada)
-- chat_web_push: un navegador suscrito por fila (un mismo teléfono puede tener varios).
-- chat_web_vapid: el par de claves VAPID del servidor; el panel lo genera solo la primera vez.
-- =====================================================================

CREATE TABLE IF NOT EXISTS bot_clima.chat_web_push (
  id          serial       PRIMARY KEY,
  telefono    varchar(20)  NOT NULL,
  endpoint    text         NOT NULL UNIQUE,
  p256dh      text         NOT NULL,
  auth        text         NOT NULL,
  navegador   varchar(200),
  creado_el   timestamptz  NOT NULL DEFAULT now(),
  ultimo_envio_el timestamptz
);
CREATE INDEX IF NOT EXISTS chat_web_push_telefono ON bot_clima.chat_web_push (telefono);

CREATE TABLE IF NOT EXISTS bot_clima.chat_web_vapid (
  id        int   PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  publica   text  NOT NULL,
  privada   text  NOT NULL,
  creado_el timestamptz NOT NULL DEFAULT now()
);
