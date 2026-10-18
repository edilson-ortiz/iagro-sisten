-- =====================================================================
-- 0007 · Consumo de mensajes (tokens)
-- Cada mensaje SALIENTE de WhatsApp (bot, alertas o agente en Chatwoot)
-- consume 1 token. Cada usuario tiene un límite por mes calendario
-- (zona horaria configurada); los tokens no usados no se acumulan.
-- Los mensajes se copian desde la API de Chatwoot con "Sincronizar"
-- en el panel (página Consumo).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Límite de tokens: global (configuración) y opcional por plan
-- ---------------------------------------------------------------------
INSERT INTO bot_clima.configuracion (clave, valor, tipo, grupo, etiqueta, descripcion, orden) VALUES
('tokens_mes', '80', 'numero', 'suscripcion', 'Tokens por mes',
 'Mensajes salientes incluidos cada mes calendario. No se acumulan de un mes a otro. Si el plan del último pago tiene su propio límite, se usa ese.', 13)
ON CONFLICT (clave) DO NOTHING;

ALTER TABLE bot_clima.planes ADD COLUMN IF NOT EXISTS tokens_mes integer CHECK (tokens_mes >= 0);
COMMENT ON COLUMN bot_clima.planes.tokens_mes IS 'Tokens (mensajes salientes) por mes. NULL = usa la configuración tokens_mes.';

-- ---------------------------------------------------------------------
-- Mensajes salientes copiados desde Chatwoot
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bot_clima.mensajes_salientes (
  chatwoot_message_id       bigint       PRIMARY KEY,
  usuario_id                bigint       NOT NULL REFERENCES bot_clima.usuarios(id) ON DELETE CASCADE,
  chatwoot_conversation_id  bigint       NOT NULL,
  enviado_el                timestamptz  NOT NULL,
  plantilla                 boolean      NOT NULL DEFAULT false,  -- plantilla de WhatsApp (fuera de la ventana de 24 h)
  estado                    varchar(12)  NOT NULL,                -- sent | delivered | read | failed (de Chatwoot)
  contenido                 varchar(200),
  sincronizado_el           timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mensajes_salientes_usuario_fecha ON bot_clima.mensajes_salientes (usuario_id, enviado_el);
CREATE INDEX IF NOT EXISTS idx_mensajes_salientes_fecha ON bot_clima.mensajes_salientes (enviado_el);
COMMENT ON TABLE bot_clima.mensajes_salientes IS 'Mensajes salientes de WhatsApp por usuario (copiados de Chatwoot). Los fallidos no consumen token.';

CREATE TABLE IF NOT EXISTS bot_clima.consumo_sincronizaciones (
  id            bigserial    PRIMARY KEY,
  mes           date         NOT NULL,
  ejecutada_el  timestamptz  NOT NULL DEFAULT now(),
  duracion_ms   integer      NOT NULL DEFAULT 0,
  usuarios      integer      NOT NULL DEFAULT 0,  -- usuarios revisados
  mensajes      integer      NOT NULL DEFAULT 0,  -- mensajes salientes encontrados en el mes
  errores       jsonb        NOT NULL DEFAULT '[]',
  admin_id      bigint       REFERENCES bot_clima.administradores(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_consumo_sincronizaciones_mes ON bot_clima.consumo_sincronizaciones (mes, ejecutada_el DESC);

-- ---------------------------------------------------------------------
-- Funciones (también sirven para que n8n consulte antes de enviar)
-- ---------------------------------------------------------------------

-- Límite mensual del usuario: plan de su último pago, o la configuración global
CREATE OR REPLACE FUNCTION bot_clima.limite_tokens(p_usuario_id bigint) RETURNS integer
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT pl.tokens_mes
       FROM bot_clima.pagos p JOIN bot_clima.planes pl ON pl.id = p.plan_id
      WHERE p.usuario_id = p_usuario_id
      ORDER BY p.fecha DESC LIMIT 1),
    bot_clima.cfg_num('tokens_mes', 80)::int)
$$;

-- Tokens usados en el mes de p_mes (por defecto, el mes actual en la zona horaria configurada)
CREATE OR REPLACE FUNCTION bot_clima.tokens_usados(p_usuario_id bigint, p_mes date DEFAULT NULL) RETURNS integer
LANGUAGE sql STABLE AS $$
  WITH r AS (
    SELECT date_trunc('month', COALESCE(p_mes, bot_clima.hoy()))::timestamp AS mes,
           bot_clima.cfg_texto('zona_horaria', 'America/La_Paz') AS z
  )
  SELECT count(*)::int
    FROM bot_clima.mensajes_salientes m, r
   WHERE m.usuario_id = p_usuario_id
     AND m.estado <> 'failed'
     AND m.enviado_el >= (r.mes AT TIME ZONE r.z)
     AND m.enviado_el <  ((r.mes + interval '1 month') AT TIME ZONE r.z)
$$;
