-- =====================================================================
-- 0003 · Reglas de negocio como funciones SQL
-- El panel y los flujos de n8n llaman a estas funciones, así la lógica
-- (prueba, pagos, vencimientos, bloqueo de 7 días) vive en un solo lugar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Lectura de configuración
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION bot_clima.cfg(p_clave text) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT valor FROM bot_clima.configuracion WHERE clave = p_clave
$$;

CREATE OR REPLACE FUNCTION bot_clima.cfg_num(p_clave text, p_defecto numeric) RETURNS numeric
LANGUAGE sql STABLE AS $$
  SELECT COALESCE((SELECT (valor #>> '{}')::numeric FROM bot_clima.configuracion WHERE clave = p_clave), p_defecto)
$$;

CREATE OR REPLACE FUNCTION bot_clima.cfg_texto(p_clave text, p_defecto text) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT COALESCE((SELECT valor #>> '{}' FROM bot_clima.configuracion WHERE clave = p_clave), p_defecto)
$$;

-- Fecha de "hoy" en la zona horaria configurada (no la del servidor)
CREATE OR REPLACE FUNCTION bot_clima.hoy() RETURNS date
LANGUAGE sql STABLE AS $$
  SELECT (now() AT TIME ZONE bot_clima.cfg_texto('zona_horaria', 'America/La_Paz'))::date
$$;

-- ---------------------------------------------------------------------
-- Vista principal de usuarios con datos calculados
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW bot_clima.v_usuarios AS
SELECT
  u.*,
  (u.vence_el - bot_clima.hoy())                                         AS dias_restantes,
  (u.activo AND u.estado <> 'vencido' AND u.vence_el >= bot_clima.hoy()) AS vigente,
  CASE WHEN u.ultima_alerta_lluvia IS NOT NULL
       THEN u.ultima_alerta_lluvia + make_interval(days => bot_clima.cfg_num('lluvia_dias_bloqueo', 7)::int)
  END                                                                    AS alerta_bloqueada_hasta,
  p.ultimo_pago,
  COALESCE(p.total_pagado, 0)                                            AS total_pagado,
  COALESCE(p.cantidad_pagos, 0)                                          AS cantidad_pagos
FROM bot_clima.usuarios u
LEFT JOIN LATERAL (
  SELECT max(fecha) AS ultimo_pago, sum(monto) AS total_pagado, count(*) AS cantidad_pagos
  FROM bot_clima.pagos WHERE usuario_id = u.id
) p ON true;

-- ---------------------------------------------------------------------
-- Registro de usuario (lo llama el bot)
-- - Crea/reutiliza la fila en public.users (radar web y rain_records siguen funcionando)
-- - Si ya existe en bot_clima, solo actualiza ubicación/contacto: NO reinicia la prueba
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION bot_clima.registrar_usuario(
  p_telefono            text,
  p_nombre              text,
  p_latitud             double precision,
  p_longitud            double precision,
  p_zona                text,
  p_origen              text,
  p_chatwoot_contact_id bigint DEFAULT NULL
) RETURNS TABLE (usuario_id bigint, es_nuevo boolean, vence_el date, dias_prueba integer)
LANGUAGE plpgsql AS $$
DECLARE
  v_tel     text := regexp_replace(p_telefono, '[^0-9]', '', 'g');
  v_id      bigint;
  v_dias    integer := bot_clima.cfg_num('prueba_dias', 30)::int;
  v_nuevo   boolean := false;
BEGIN
  IF v_tel = '' THEN
    RAISE EXCEPTION 'Teléfono vacío';
  END IF;

  SELECT id INTO v_id FROM public.users WHERE phone_number = v_tel;
  IF v_id IS NULL THEN
    INSERT INTO public.users (phone_number, sensor_code, is_active, latitude, longitude, nombre_propiedad)
    VALUES (v_tel, 'EP999', true, p_latitud, p_longitud, p_nombre)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.users
       SET latitude = COALESCE(p_latitud, latitude),
           longitude = COALESCE(p_longitud, longitude),
           nombre_propiedad = COALESCE(nombre_propiedad, p_nombre),
           updated_at = now()
     WHERE id = v_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM bot_clima.usuarios WHERE id = v_id) THEN
    INSERT INTO bot_clima.usuarios (id, chatwoot_contact_id, telefono, nombre, latitud, longitud, zona,
                                    ubicacion_origen, estado, vence_el)
    VALUES (v_id, p_chatwoot_contact_id, v_tel, p_nombre, p_latitud, p_longitud, p_zona,
            p_origen, 'prueba', bot_clima.hoy() + v_dias);
    v_nuevo := true;
  ELSE
    UPDATE bot_clima.usuarios
       SET latitud = COALESCE(p_latitud, latitud),
           longitud = COALESCE(p_longitud, longitud),
           zona = COALESCE(p_zona, zona),
           ubicacion_origen = COALESCE(p_origen, ubicacion_origen),
           nombre = COALESCE(nombre, p_nombre),
           chatwoot_contact_id = COALESCE(p_chatwoot_contact_id, chatwoot_contact_id)
     WHERE id = v_id;
  END IF;

  RETURN QUERY
  SELECT u.id, v_nuevo, u.vence_el, v_dias FROM bot_clima.usuarios u WHERE u.id = v_id;
END $$;

-- ---------------------------------------------------------------------
-- Registrar pago (lo llama el panel)
-- Extiende desde hoy si ya venció, o desde el vencimiento si aún está vigente.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION bot_clima.registrar_pago(
  p_usuario_id  bigint,
  p_plan_id     bigint  DEFAULT NULL,
  p_monto       numeric DEFAULT NULL,
  p_dias        integer DEFAULT NULL,
  p_admin_id    bigint  DEFAULT NULL,
  p_nota        text    DEFAULT NULL
) RETURNS bot_clima.pagos
LANGUAGE plpgsql AS $$
DECLARE
  v_usuario  bot_clima.usuarios;
  v_plan     bot_clima.planes;
  v_dias     integer;
  v_monto    numeric;
  v_base     date;
  v_nuevo    date;
  v_pago     bot_clima.pagos;
BEGIN
  SELECT * INTO v_usuario FROM bot_clima.usuarios WHERE id = p_usuario_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario % no existe', p_usuario_id;
  END IF;

  IF p_plan_id IS NOT NULL THEN
    SELECT * INTO v_plan FROM bot_clima.planes WHERE id = p_plan_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Plan % no existe', p_plan_id;
    END IF;
  END IF;

  v_dias  := COALESCE(p_dias, v_plan.dias, bot_clima.cfg_num('pago_dias', 30)::int);
  v_monto := COALESCE(p_monto, v_plan.monto, 0);
  IF v_dias <= 0 THEN
    RAISE EXCEPTION 'Los días deben ser mayores a 0';
  END IF;

  v_base  := GREATEST(v_usuario.vence_el, bot_clima.hoy());
  v_nuevo := v_base + v_dias;

  UPDATE bot_clima.usuarios
     SET estado = 'pagado', vence_el = v_nuevo, aviso_vencimiento_el = NULL
   WHERE id = p_usuario_id;

  INSERT INTO bot_clima.pagos (usuario_id, plan_id, monto, moneda, dias_agregados, vence_anterior, vence_nuevo, registrado_por, nota)
  VALUES (p_usuario_id, p_plan_id, v_monto,
          COALESCE(v_plan.moneda, bot_clima.cfg_texto('moneda', 'BOB')),
          v_dias, v_usuario.vence_el, v_nuevo, p_admin_id, p_nota)
  RETURNING * INTO v_pago;

  RETURN v_pago;
END $$;

-- ---------------------------------------------------------------------
-- Control diario de vencimientos (lo llama n8n)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION bot_clima.marcar_vencidos()
RETURNS TABLE (usuario_id bigint, telefono varchar, nombre varchar, vence_el date)
LANGUAGE sql AS $$
  UPDATE bot_clima.usuarios u
     SET estado = 'vencido'
   WHERE u.estado IN ('prueba', 'pagado')
     AND u.vence_el < bot_clima.hoy()
  RETURNING u.id, u.telefono, u.nombre, u.vence_el
$$;

-- Usuarios a los que hay que avisar que vencen pronto (y aún no se les avisó)
CREATE OR REPLACE FUNCTION bot_clima.usuarios_por_vencer()
RETURNS SETOF bot_clima.v_usuarios
LANGUAGE sql STABLE AS $$
  SELECT * FROM bot_clima.v_usuarios
   WHERE vigente
     AND dias_restantes BETWEEN 0 AND bot_clima.cfg_num('aviso_vencimiento_dias', 3)
     AND (aviso_vencimiento_el IS NULL OR aviso_vencimiento_el < vence_el - bot_clima.cfg_num('aviso_vencimiento_dias', 3)::int)
$$;

-- ---------------------------------------------------------------------
-- Alerta de lluvia
-- ---------------------------------------------------------------------
-- Candidatos: vigentes, con coordenadas y sin alerta en los últimos N días
CREATE OR REPLACE FUNCTION bot_clima.usuarios_para_alerta_lluvia()
RETURNS SETOF bot_clima.v_usuarios
LANGUAGE sql STABLE AS $$
  SELECT * FROM bot_clima.v_usuarios
   WHERE vigente
     AND latitud IS NOT NULL AND longitud IS NOT NULL
     AND (ultima_alerta_lluvia IS NULL
          OR ultima_alerta_lluvia <= now() - make_interval(days => bot_clima.cfg_num('lluvia_dias_bloqueo', 7)::int))
$$;

-- Registra el envío; solo bloquea al usuario (ultima_alerta_lluvia) si el envío no falló
CREATE OR REPLACE FUNCTION bot_clima.registrar_alerta_lluvia(
  p_usuario_id        bigint,
  p_probabilidad      integer,
  p_hora_pronostico   timestamptz,
  p_conversation_id   bigint DEFAULT NULL,
  p_message_id        bigint DEFAULT NULL,
  p_error             text   DEFAULT NULL
) RETURNS bot_clima.alertas_enviadas
LANGUAGE plpgsql AS $$
DECLARE
  v_alerta bot_clima.alertas_enviadas;
BEGIN
  INSERT INTO bot_clima.alertas_enviadas (usuario_id, tipo, probabilidad, hora_pronostico, estado,
                                          chatwoot_conversation_id, chatwoot_message_id, error)
  VALUES (p_usuario_id, 'lluvia', p_probabilidad, p_hora_pronostico,
          CASE WHEN p_error IS NULL THEN 'enviado' ELSE 'fallido' END,
          p_conversation_id, p_message_id, p_error)
  RETURNING * INTO v_alerta;

  IF p_error IS NULL THEN
    UPDATE bot_clima.usuarios SET ultima_alerta_lluvia = v_alerta.enviada_el WHERE id = p_usuario_id;
  END IF;

  RETURN v_alerta;
END $$;

-- ---------------------------------------------------------------------
-- Difusiones
-- ---------------------------------------------------------------------
-- Destinatarios de un segmento (el panel lo usa para contar y n8n para enviar)
CREATE OR REPLACE FUNCTION bot_clima.usuarios_por_segmento(p_segmento text, p_zona text DEFAULT NULL)
RETURNS SETOF bot_clima.v_usuarios
LANGUAGE sql STABLE AS $$
  SELECT * FROM bot_clima.v_usuarios v
   WHERE v.activo
     AND CASE p_segmento
           WHEN 'todos'   THEN true
           WHEN 'prueba'  THEN v.estado = 'prueba'
           WHEN 'pagado'  THEN v.estado = 'pagado'
           WHEN 'vencido' THEN v.estado = 'vencido'
           WHEN 'zona'    THEN lower(v.zona) = lower(p_zona)
           ELSE false
         END
$$;

-- Crea la difusión "reenviar a quienes no respondieron" a partir de otra
CREATE OR REPLACE FUNCTION bot_clima.crear_reenvio_no_respondieron(p_difusion_id bigint, p_admin_id bigint DEFAULT NULL)
RETURNS bot_clima.difusiones
LANGUAGE plpgsql AS $$
DECLARE
  v_origen bot_clima.difusiones;
  v_nueva  bot_clima.difusiones;
BEGIN
  SELECT * INTO v_origen FROM bot_clima.difusiones WHERE id = p_difusion_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Difusión % no existe', p_difusion_id;
  END IF;

  INSERT INTO bot_clima.difusiones (titulo, mensaje, segmento, segmento_zona, plantilla, plantilla_idioma,
                                    difusion_origen_id, creada_por)
  VALUES (left('Reenvío: ' || v_origen.titulo, 150), v_origen.mensaje, v_origen.segmento, v_origen.segmento_zona,
          v_origen.plantilla, v_origen.plantilla_idioma, v_origen.id, p_admin_id)
  RETURNING * INTO v_nueva;

  -- Precarga los destinatarios: solo los que no respondieron la original
  INSERT INTO bot_clima.difusion_envios (difusion_id, usuario_id)
  SELECT v_nueva.id, e.usuario_id
    FROM bot_clima.difusion_envios e
    JOIN bot_clima.usuarios u ON u.id = e.usuario_id AND u.activo
   WHERE e.difusion_id = p_difusion_id AND NOT e.respondio;

  UPDATE bot_clima.difusiones
     SET total_destinatarios = (SELECT count(*) FROM bot_clima.difusion_envios WHERE difusion_id = v_nueva.id)
   WHERE id = v_nueva.id
  RETURNING * INTO v_nueva;

  RETURN v_nueva;
END $$;

-- ---------------------------------------------------------------------
-- Seguimiento de estados (webhook de Chatwoot → n8n → estas funciones)
-- ---------------------------------------------------------------------
-- Estado de un mensaje saliente: 'delivered' | 'read' | 'failed' (estados de Chatwoot)
CREATE OR REPLACE FUNCTION bot_clima.actualizar_estado_mensaje(p_message_id bigint, p_estado text, p_error text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  n1 integer; n2 integer;
BEGIN
  UPDATE bot_clima.difusion_envios
     SET entregado    = entregado OR p_estado IN ('delivered', 'read'),
         entregado_el = COALESCE(entregado_el, CASE WHEN p_estado IN ('delivered', 'read') THEN now() END),
         leido        = leido OR p_estado = 'read',
         leido_el     = COALESCE(leido_el, CASE WHEN p_estado = 'read' THEN now() END),
         error        = CASE WHEN p_estado = 'failed' THEN COALESCE(p_error, 'Falló la entrega') ELSE error END
   WHERE chatwoot_message_id = p_message_id;
  GET DIAGNOSTICS n1 = ROW_COUNT;

  UPDATE bot_clima.alertas_enviadas
     SET estado = CASE
                    WHEN p_estado = 'failed' THEN 'fallido'
                    WHEN p_estado = 'read' OR estado = 'leido' THEN 'leido'
                    WHEN p_estado = 'delivered' THEN 'entregado'
                    ELSE estado
                  END,
         entregado_el = COALESCE(entregado_el, CASE WHEN p_estado IN ('delivered', 'read') THEN now() END),
         leido_el     = COALESCE(leido_el, CASE WHEN p_estado = 'read' THEN now() END),
         error        = CASE WHEN p_estado = 'failed' THEN COALESCE(p_error, 'Falló la entrega') ELSE error END
   WHERE chatwoot_message_id = p_message_id;
  GET DIAGNOSTICS n2 = ROW_COUNT;

  RETURN n1 + n2;
END $$;

-- Mensaje entrante: marca como respondida la difusión enviada más reciente
-- dentro de la ventana configurada, y la alerta de lluvia si fue reciente.
CREATE OR REPLACE FUNCTION bot_clima.registrar_respuesta(p_telefono text, p_fecha timestamptz DEFAULT now())
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  v_tel   text := regexp_replace(p_telefono, '[^0-9]', '', 'g');
  v_uid   bigint;
  v_dias  integer := bot_clima.cfg_num('respuesta_ventana_dias', 3)::int;
  n1 integer := 0; n2 integer := 0;
BEGIN
  SELECT id INTO v_uid FROM bot_clima.usuarios WHERE telefono = v_tel;
  IF v_uid IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE bot_clima.difusion_envios e
     SET respondio = true, respondio_el = p_fecha,
         -- si respondió, el mensaje obviamente llegó y fue leído
         entregado = true, entregado_el = COALESCE(e.entregado_el, p_fecha),
         leido = true, leido_el = COALESCE(e.leido_el, p_fecha)
   WHERE e.id = (
     SELECT id FROM bot_clima.difusion_envios
      WHERE usuario_id = v_uid AND enviado AND NOT respondio
        AND enviado_el BETWEEN p_fecha - make_interval(days => v_dias) AND p_fecha
      ORDER BY enviado_el DESC LIMIT 1);
  GET DIAGNOSTICS n1 = ROW_COUNT;

  UPDATE bot_clima.alertas_enviadas a
     SET respondio_el = p_fecha,
         estado = CASE WHEN a.estado = 'fallido' THEN a.estado ELSE 'leido' END,
         leido_el = COALESCE(a.leido_el, p_fecha)
   WHERE a.id = (
     SELECT id FROM bot_clima.alertas_enviadas
      WHERE usuario_id = v_uid AND respondio_el IS NULL AND estado <> 'fallido'
        AND enviada_el BETWEEN p_fecha - make_interval(days => v_dias) AND p_fecha
      ORDER BY enviada_el DESC LIMIT 1);
  GET DIAGNOSTICS n2 = ROW_COUNT;

  RETURN n1 + n2;
END $$;

-- Registro de eventos desde n8n con una sola llamada
CREATE OR REPLACE FUNCTION bot_clima.log(p_nivel text, p_origen text, p_mensaje text, p_datos jsonb DEFAULT NULL)
RETURNS void
LANGUAGE sql AS $$
  INSERT INTO bot_clima.logs (nivel, origen, mensaje, datos) VALUES (p_nivel, p_origen, p_mensaje, p_datos)
$$;
