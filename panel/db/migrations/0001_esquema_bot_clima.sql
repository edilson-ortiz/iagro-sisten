-- =====================================================================
-- 0001 · Esquema bot_clima: tablas base
-- Base de datos: trd (la misma que usa la credencial "Postgres account" de n8n).
-- No toca ninguna tabla de Chatwoot ni modifica public.users / public.user_tmp / public.rain_records.
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS bot_clima;

-- Mantiene updated_at al día en cada UPDATE
CREATE OR REPLACE FUNCTION bot_clima.set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------
-- Administradores del panel (login con usuario y contraseña)
-- ---------------------------------------------------------------------
CREATE TABLE bot_clima.administradores (
  id             bigserial PRIMARY KEY,
  usuario        varchar(50)  NOT NULL UNIQUE,
  nombre         varchar(120) NOT NULL,
  password_hash  text         NOT NULL,
  activo         boolean      NOT NULL DEFAULT true,
  ultimo_acceso  timestamptz,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  updated_at     timestamptz  NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_administradores_updated BEFORE UPDATE ON bot_clima.administradores
  FOR EACH ROW EXECUTE FUNCTION bot_clima.set_updated_at();

-- ---------------------------------------------------------------------
-- Configuración editable desde el panel (clave → valor JSON)
-- ---------------------------------------------------------------------
CREATE TABLE bot_clima.configuracion (
  clave        varchar(80)  PRIMARY KEY,
  valor        jsonb        NOT NULL,
  tipo         varchar(20)  NOT NULL CHECK (tipo IN ('numero', 'texto', 'texto_largo', 'booleano', 'hora')),
  grupo        varchar(40)  NOT NULL,
  etiqueta     varchar(120) NOT NULL,
  descripcion  text,
  orden        integer      NOT NULL DEFAULT 0,
  updated_at   timestamptz  NOT NULL DEFAULT now(),
  updated_by   bigint       REFERENCES bot_clima.administradores(id) ON DELETE SET NULL
);
CREATE TRIGGER trg_configuracion_updated BEFORE UPDATE ON bot_clima.configuracion
  FOR EACH ROW EXECUTE FUNCTION bot_clima.set_updated_at();

-- ---------------------------------------------------------------------
-- Planes de pago (editables desde el panel; el cobro es manual)
-- ---------------------------------------------------------------------
CREATE TABLE bot_clima.planes (
  id           bigserial PRIMARY KEY,
  nombre       varchar(80)    NOT NULL,
  descripcion  text,
  dias         integer        NOT NULL CHECK (dias > 0),
  monto        numeric(10, 2) NOT NULL DEFAULT 0 CHECK (monto >= 0),
  moneda       varchar(3)     NOT NULL DEFAULT 'BOB',
  activo       boolean        NOT NULL DEFAULT true,
  orden        integer        NOT NULL DEFAULT 0,
  created_at   timestamptz    NOT NULL DEFAULT now(),
  updated_at   timestamptz    NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_planes_updated BEFORE UPDATE ON bot_clima.planes
  FOR EACH ROW EXECUTE FUNCTION bot_clima.set_updated_at();

-- ---------------------------------------------------------------------
-- Usuarios del bot
-- id = mismo id que public.users, así siguen funcionando el radar web
-- (iagro360.xyz/radar/{id}) y public.rain_records sin cambios.
-- ---------------------------------------------------------------------
CREATE TABLE bot_clima.usuarios (
  id                     bigint       PRIMARY KEY REFERENCES public.users(id) ON DELETE RESTRICT,
  chatwoot_contact_id    bigint       UNIQUE,
  telefono               varchar(20)  NOT NULL UNIQUE,
  nombre                 varchar(150),
  latitud                double precision CHECK (latitud BETWEEN -90 AND 90),
  longitud               double precision CHECK (longitud BETWEEN -180 AND 180),
  zona                   varchar(120),
  ubicacion_origen       varchar(12)  CHECK (ubicacion_origen IN ('pin', 'geocoding', 'web', 'migracion', 'panel')),
  fecha_registro         timestamptz  NOT NULL DEFAULT now(),
  estado                 varchar(10)  NOT NULL DEFAULT 'prueba' CHECK (estado IN ('prueba', 'pagado', 'vencido')),
  vence_el               date         NOT NULL,
  ultima_alerta_lluvia   timestamptz,
  aviso_vencimiento_el   date,        -- último aviso de "tu plan vence pronto" enviado
  activo                 boolean      NOT NULL DEFAULT true,
  notas                  text,
  created_at             timestamptz  NOT NULL DEFAULT now(),
  updated_at             timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX idx_usuarios_estado_vence ON bot_clima.usuarios (estado, vence_el);
CREATE INDEX idx_usuarios_zona ON bot_clima.usuarios (lower(zona));
CREATE INDEX idx_usuarios_ultima_alerta ON bot_clima.usuarios (ultima_alerta_lluvia);
CREATE TRIGGER trg_usuarios_updated BEFORE UPDATE ON bot_clima.usuarios
  FOR EACH ROW EXECUTE FUNCTION bot_clima.set_updated_at();

-- ---------------------------------------------------------------------
-- Pagos registrados manualmente desde el panel
-- ---------------------------------------------------------------------
CREATE TABLE bot_clima.pagos (
  id               bigserial PRIMARY KEY,
  usuario_id       bigint         NOT NULL REFERENCES bot_clima.usuarios(id) ON DELETE CASCADE,
  plan_id          bigint         REFERENCES bot_clima.planes(id) ON DELETE SET NULL,
  fecha            timestamptz    NOT NULL DEFAULT now(),
  monto            numeric(10, 2) NOT NULL CHECK (monto >= 0),
  moneda           varchar(3)     NOT NULL DEFAULT 'BOB',
  dias_agregados   integer        NOT NULL CHECK (dias_agregados > 0),
  vence_anterior   date,
  vence_nuevo      date           NOT NULL,
  registrado_por   bigint         REFERENCES bot_clima.administradores(id) ON DELETE SET NULL,
  nota             text
);
CREATE INDEX idx_pagos_usuario_fecha ON bot_clima.pagos (usuario_id, fecha DESC);
CREATE INDEX idx_pagos_fecha ON bot_clima.pagos (fecha DESC);

-- ---------------------------------------------------------------------
-- Difusiones (mensajes masivos) y su seguimiento por destinatario
-- ---------------------------------------------------------------------
CREATE TABLE bot_clima.difusiones (
  id                    bigserial PRIMARY KEY,
  titulo                varchar(150) NOT NULL,
  mensaje               text         NOT NULL,
  segmento              varchar(10)  NOT NULL CHECK (segmento IN ('todos', 'prueba', 'pagado', 'vencido', 'zona')),
  segmento_zona         varchar(120),
  plantilla             varchar(120),               -- plantilla de WhatsApp (obligatoria fuera de la ventana de 24 h)
  plantilla_idioma      varchar(10)  NOT NULL DEFAULT 'es',
  difusion_origen_id    bigint       REFERENCES bot_clima.difusiones(id) ON DELETE SET NULL, -- reenvío a quienes no respondieron
  estado                varchar(12)  NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'enviando', 'enviada', 'error')),
  total_destinatarios   integer      NOT NULL DEFAULT 0,
  enviada_el            timestamptz,
  creada_por            bigint       REFERENCES bot_clima.administradores(id) ON DELETE SET NULL,
  created_at            timestamptz  NOT NULL DEFAULT now(),
  updated_at            timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT difusiones_zona_requerida CHECK (segmento <> 'zona' OR segmento_zona IS NOT NULL)
);
CREATE INDEX idx_difusiones_created ON bot_clima.difusiones (created_at DESC);
CREATE TRIGGER trg_difusiones_updated BEFORE UPDATE ON bot_clima.difusiones
  FOR EACH ROW EXECUTE FUNCTION bot_clima.set_updated_at();

CREATE TABLE bot_clima.difusion_envios (
  id                         bigserial PRIMARY KEY,
  difusion_id                bigint      NOT NULL REFERENCES bot_clima.difusiones(id) ON DELETE CASCADE,
  usuario_id                 bigint      NOT NULL REFERENCES bot_clima.usuarios(id) ON DELETE CASCADE,
  chatwoot_conversation_id   bigint,
  chatwoot_message_id        bigint,
  enviado                    boolean     NOT NULL DEFAULT false,
  enviado_el                 timestamptz,
  entregado                  boolean     NOT NULL DEFAULT false,
  entregado_el               timestamptz,
  leido                      boolean     NOT NULL DEFAULT false,
  leido_el                   timestamptz,
  respondio                  boolean     NOT NULL DEFAULT false,
  respondio_el               timestamptz,
  error                      text,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT difusion_envios_unico UNIQUE (difusion_id, usuario_id)
);
CREATE INDEX idx_envios_mensaje ON bot_clima.difusion_envios (chatwoot_message_id) WHERE chatwoot_message_id IS NOT NULL;
CREATE INDEX idx_envios_usuario_fecha ON bot_clima.difusion_envios (usuario_id, enviado_el DESC);

-- ---------------------------------------------------------------------
-- Historial de alertas automáticas (lluvia y otras futuras)
-- ---------------------------------------------------------------------
CREATE TABLE bot_clima.alertas_enviadas (
  id                         bigserial PRIMARY KEY,
  usuario_id                 bigint      NOT NULL REFERENCES bot_clima.usuarios(id) ON DELETE CASCADE,
  tipo                       varchar(30) NOT NULL DEFAULT 'lluvia',
  probabilidad               smallint    CHECK (probabilidad BETWEEN 0 AND 100),
  hora_pronostico            timestamptz,
  enviada_el                 timestamptz NOT NULL DEFAULT now(),
  estado                     varchar(10) NOT NULL DEFAULT 'enviado' CHECK (estado IN ('enviado', 'entregado', 'leido', 'fallido')),
  chatwoot_conversation_id   bigint,
  chatwoot_message_id        bigint,
  entregado_el               timestamptz,
  leido_el                   timestamptz,
  respondio_el               timestamptz,
  error                      text
);
CREATE INDEX idx_alertas_usuario_fecha ON bot_clima.alertas_enviadas (usuario_id, enviada_el DESC);
CREATE INDEX idx_alertas_fecha ON bot_clima.alertas_enviadas (enviada_el DESC);
CREATE INDEX idx_alertas_mensaje ON bot_clima.alertas_enviadas (chatwoot_message_id) WHERE chatwoot_message_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- Registro de eventos y errores (lo escriben n8n y el panel)
-- ---------------------------------------------------------------------
CREATE TABLE bot_clima.logs (
  id          bigserial PRIMARY KEY,
  nivel       varchar(6)  NOT NULL CHECK (nivel IN ('info', 'aviso', 'error')),
  origen      varchar(60) NOT NULL,   -- ej: 'n8n:alerta_lluvia', 'panel:pagos'
  mensaje     text        NOT NULL,
  datos       jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_logs_created ON bot_clima.logs (created_at DESC);
CREATE INDEX idx_logs_nivel ON bot_clima.logs (nivel, created_at DESC);
