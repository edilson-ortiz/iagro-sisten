-- =====================================================================
-- 0011 · Difusiones masivas (módulo aparte)
-- Una difusión envía una plantilla de WhatsApp aprobada por Meta (la que
-- tiene Chatwoot) a una lista de números cargada desde CSV o Excel, con
-- variables por contacto. Se envía en el momento o en una fecha programada.
-- El panel crea el contacto/conversación en Chatwoot y sigue el estado de
-- cada mensaje (enviado, entregado, leído, fallido) y si respondió.
-- No reemplaza a bot_clima.difusiones (segmentos de usuarios del bot).
-- =====================================================================

CREATE TABLE IF NOT EXISTS bot_clima.campanas (
  id                  bigserial    PRIMARY KEY,
  nombre              varchar(150) NOT NULL,
  descripcion         text,
  inbox_id            integer      NOT NULL,
  plantilla_nombre    varchar(512) NOT NULL,
  plantilla_idioma    varchar(15)  NOT NULL,
  plantilla_categoria varchar(30),
  plantilla_cuerpo    text         NOT NULL,                 -- copia del texto al crearla (vista previa e historial)
  mapeo               jsonb        NOT NULL,                 -- columnas usadas: teléfono, nombre y cada variable
  estado              varchar(12)  NOT NULL DEFAULT 'programada'
                      CHECK (estado IN ('programada', 'enviando', 'pausada', 'enviada', 'cancelada')),
  programada_para     timestamptz  NOT NULL DEFAULT now(),
  iniciada_el         timestamptz,
  finalizada_el       timestamptz,
  total               integer      NOT NULL DEFAULT 0,
  creada_por          bigint       REFERENCES bot_clima.administradores(id) ON DELETE SET NULL,
  created_at          timestamptz  NOT NULL DEFAULT now(),
  updated_at          timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_campanas_estado ON bot_clima.campanas (estado, programada_para);
CREATE INDEX IF NOT EXISTS idx_campanas_created ON bot_clima.campanas (created_at DESC);
DROP TRIGGER IF EXISTS trg_campanas_updated ON bot_clima.campanas;
CREATE TRIGGER trg_campanas_updated BEFORE UPDATE ON bot_clima.campanas
  FOR EACH ROW EXECUTE FUNCTION bot_clima.set_updated_at();

CREATE TABLE IF NOT EXISTS bot_clima.campana_destinatarios (
  id                        bigserial    PRIMARY KEY,
  campana_id                bigint       NOT NULL REFERENCES bot_clima.campanas(id) ON DELETE CASCADE,
  telefono                  varchar(20)  NOT NULL,
  nombre                    varchar(150),
  parametros                jsonb        NOT NULL DEFAULT '{}',   -- {"1": "valor", ...} ya resueltos
  estado                    varchar(10)  NOT NULL DEFAULT 'pendiente'
                            CHECK (estado IN ('pendiente', 'enviando', 'enviado', 'entregado', 'leido', 'fallido')),
  error                     text,
  intentos                  smallint     NOT NULL DEFAULT 0,      -- reintentos ante errores pasajeros de Chatwoot
  chatwoot_contact_id       bigint,
  chatwoot_conversation_id  bigint,
  chatwoot_message_id       bigint,
  enviado_el                timestamptz,
  entregado_el              timestamptz,
  leido_el                  timestamptz,
  respondio_el              timestamptz,
  respuesta                 varchar(200),
  revisado_el               timestamptz,   -- última consulta de estado a Chatwoot
  actualizado_el            timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (campana_id, telefono)
);
CREATE INDEX IF NOT EXISTS idx_campana_dest_estado ON bot_clima.campana_destinatarios (campana_id, estado);
CREATE INDEX IF NOT EXISTS idx_campana_dest_mensaje ON bot_clima.campana_destinatarios (chatwoot_message_id) WHERE chatwoot_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_campana_dest_conv ON bot_clima.campana_destinatarios (chatwoot_conversation_id, enviado_el DESC) WHERE chatwoot_conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_campana_dest_seguimiento ON bot_clima.campana_destinatarios (revisado_el NULLS FIRST)
  WHERE estado IN ('enviado', 'entregado', 'leido') AND chatwoot_message_id IS NOT NULL;

-- Token del webhook de Chatwoot → panel (estados en tiempo real)
INSERT INTO bot_clima.configuracion (clave, valor, tipo, grupo, etiqueta, descripcion, orden)
VALUES ('chatwoot_webhook_token', to_jsonb(md5(random()::text || clock_timestamp()::text) || md5(random()::text)),
        'secreto', 'whatsapp', 'Token del webhook de Chatwoot',
        'Va en la URL del webhook que Chatwoot llama para avisar entregado/leído y respuestas de las difusiones.', 49)
ON CONFLICT (clave) DO NOTHING;
