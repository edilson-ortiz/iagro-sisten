-- =====================================================================
-- 0021 · WhatsApp → chat web
-- Cualquier mensaje que llega por WhatsApp se responde con la plantilla "Ver pronóstico",
-- cuyo botón abre https://iagro360.xyz/l/{codigo}: el chat web personal de ese teléfono.
-- El código es corto y fijo por teléfono (n8n no necesita la firma secreta del panel).
-- =====================================================================

CREATE TABLE IF NOT EXISTS bot_clima.chat_web_enlaces (
  codigo          varchar(16)  PRIMARY KEY,
  telefono        varchar(20)  NOT NULL UNIQUE,
  creado_el       timestamptz  NOT NULL DEFAULT now(),
  ultimo_envio_el timestamptz,
  envios          int          NOT NULL DEFAULT 0,
  visitas         int          NOT NULL DEFAULT 0
);

-- Código del enlace corto de un teléfono (lo crea la primera vez)
CREATE OR REPLACE FUNCTION bot_clima.enlace_chat_web(p_telefono text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_tel text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  v_codigo text;
BEGIN
  IF length(v_tel) < 8 THEN RETURN NULL; END IF;
  SELECT e.codigo INTO v_codigo FROM bot_clima.chat_web_enlaces e WHERE e.telefono = v_tel;
  IF v_codigo IS NOT NULL THEN RETURN v_codigo; END IF;
  LOOP
    v_codigo := substr(md5(random()::text || clock_timestamp()::text || v_tel), 1, 10);
    BEGIN
      INSERT INTO bot_clima.chat_web_enlaces (codigo, telefono) VALUES (v_codigo, v_tel);
      RETURN v_codigo;
    EXCEPTION WHEN unique_violation THEN
      -- Otro mensaje del mismo teléfono lo creó al mismo tiempo (o el código ya existía): se reintenta
      SELECT e.codigo INTO v_codigo FROM bot_clima.chat_web_enlaces e WHERE e.telefono = v_tel;
      IF v_codigo IS NOT NULL THEN RETURN v_codigo; END IF;
    END;
  END LOOP;
END $$;

-- Para el flujo de n8n: código del enlace, nombre del cliente y si toca enviar la plantilla
-- (como máximo una vez cada p_minutos por teléfono, para no repetirla si escribe varios mensajes seguidos)
CREATE OR REPLACE FUNCTION bot_clima.derivar_a_web(p_telefono text, p_minutos int DEFAULT 30)
RETURNS TABLE (enlace text, nombre_cliente text, enviar boolean)
LANGUAGE plpgsql AS $$
DECLARE
  v_tel text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
BEGIN
  enlace := bot_clima.enlace_chat_web(v_tel);
  IF enlace IS NULL THEN
    nombre_cliente := NULL; enviar := false;
    RETURN NEXT; RETURN;
  END IF;
  SELECT nullif(trim(u.nombre), '') INTO nombre_cliente FROM bot_clima.usuarios u WHERE u.telefono = v_tel;
  UPDATE bot_clima.chat_web_enlaces e
     SET ultimo_envio_el = now(), envios = e.envios + 1
   WHERE e.telefono = v_tel
     AND (e.ultimo_envio_el IS NULL OR e.ultimo_envio_el < now() - make_interval(mins => p_minutos));
  enviar := FOUND;
  RETURN NEXT;
END $$;

INSERT INTO bot_clima.configuracion (clave, valor, tipo, grupo, etiqueta, descripcion, orden) VALUES
('plantilla_chat_web', '"pronostico_web"', 'texto', 'whatsapp', 'Plantilla "Ver pronóstico" (WhatsApp → chat web)',
 'Plantilla que responde a cualquier mensaje de WhatsApp. Variables: {{1}} nombre en el cuerpo y {{1}} del botón = código del enlace https://iagro360.xyz/l/{{1}}.', 48)
ON CONFLICT DO NOTHING;
