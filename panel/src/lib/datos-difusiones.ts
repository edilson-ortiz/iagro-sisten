import 'server-only';
import { query, sql } from '@/lib/db';

export type Segmento = 'todos' | 'prueba' | 'pagado' | 'vencido' | 'zona';
export type EstadoDifusion = 'borrador' | 'enviando' | 'enviada' | 'error';

export type DifusionFila = {
  id: number;
  titulo: string;
  mensaje: string;
  segmento: Segmento;
  segmento_zona: string | null;
  plantilla: string | null;
  estado: EstadoDifusion;
  total_destinatarios: number;
  enviada_el: string | null;
  created_at: string;
  difusion_origen_id: number | null;
  origen_titulo: string | null;
  creada_por_nombre: string | null;
  enviados: number;
  entregados: number;
  leidos: number;
  respondieron: number;
  errores: number;
};

const COLUMNAS = sql`
  d.id, d.titulo, d.mensaje, d.segmento, d.segmento_zona, d.plantilla, d.estado, d.total_destinatarios,
  d.enviada_el, d.created_at, d.difusion_origen_id, o.titulo AS origen_titulo, a.nombre AS creada_por_nombre,
  count(e.id) FILTER (WHERE e.enviado)                AS enviados,
  count(e.id) FILTER (WHERE e.entregado)              AS entregados,
  count(e.id) FILTER (WHERE e.leido)                  AS leidos,
  count(e.id) FILTER (WHERE e.respondio)              AS respondieron,
  count(e.id) FILTER (WHERE e.error IS NOT NULL)      AS errores`;

const DESDE = sql`
  FROM bot_clima.difusiones d
  LEFT JOIN bot_clima.difusiones o ON o.id = d.difusion_origen_id
  LEFT JOIN bot_clima.administradores a ON a.id = d.creada_por
  LEFT JOIN bot_clima.difusion_envios e ON e.difusion_id = d.id`;

export async function listarDifusiones() {
  return query<DifusionFila>(sql`SELECT ${COLUMNAS} ${DESDE} GROUP BY d.id, o.titulo, a.nombre ORDER BY d.created_at DESC LIMIT 200`);
}

export async function obtenerDifusion(id: number) {
  const [d] = await query<DifusionFila>(sql`SELECT ${COLUMNAS} ${DESDE} WHERE d.id = ${id} GROUP BY d.id, o.titulo, a.nombre`);
  return d ?? null;
}

export type EnvioDetalle = {
  id: number;
  usuario_id: number;
  nombre: string | null;
  telefono: string;
  zona: string | null;
  estado_usuario: 'prueba' | 'pagado' | 'vencido';
  enviado: boolean;
  enviado_el: string | null;
  entregado: boolean;
  entregado_el: string | null;
  leido: boolean;
  leido_el: string | null;
  respondio: boolean;
  respondio_el: string | null;
  error: string | null;
  difusion_pausada: boolean;
  ventana_cerrada: boolean;
};

export async function enviosDeDifusion(id: number) {
  return query<EnvioDetalle>(sql`
    SELECT e.id, e.usuario_id, v.nombre, v.telefono, v.zona, v.estado AS estado_usuario,
           e.enviado, e.enviado_el, e.entregado, e.entregado_el, e.leido, e.leido_el,
           e.respondio, e.respondio_el, e.error, v.difusion_pausada,
           (e.enviado_el < now() - make_interval(days => bot_clima.cfg_num('respuesta_ventana_dias', 3)::int)) AS ventana_cerrada
    FROM bot_clima.difusion_envios e
    JOIN bot_clima.v_usuarios v ON v.id = e.usuario_id
    WHERE e.difusion_id = ${id}
    ORDER BY e.respondio DESC, e.leido DESC, e.entregado DESC, e.enviado DESC, v.nombre`);
}

/** Destinatarios que tendría una difusión (y cuántos quedan fuera por estar pausados) */
export async function contarSegmento(segmento: Segmento, zona: string | null) {
  const [r] = await query<{ destinatarios: number; pausados: number }>(sql`
    SELECT (SELECT count(*) FROM bot_clima.usuarios_por_segmento(${segmento}, ${zona})) AS destinatarios,
           (SELECT count(*) FROM bot_clima.usuarios_por_segmento(${segmento}, ${zona}, true) WHERE difusion_pausada) AS pausados`);
  return r!;
}

export async function muestraSegmento(segmento: Segmento, zona: string | null) {
  return query<{ id: number; nombre: string | null; telefono: string }>(sql`
    SELECT id, nombre, telefono FROM bot_clima.usuarios_por_segmento(${segmento}, ${zona}) ORDER BY nombre LIMIT 8`);
}

export type PausadoFila = {
  id: number; nombre: string | null; telefono: string; zona: string | null;
  difusiones_sin_respuesta: number; ultimo_mensaje_el: string | null; estado: 'prueba' | 'pagado' | 'vencido';
};

export async function usuariosPausados() {
  return query<PausadoFila>(sql`
    SELECT id, nombre, telefono, zona, difusiones_sin_respuesta, ultimo_mensaje_el, estado
    FROM bot_clima.v_usuarios WHERE activo AND difusion_pausada ORDER BY difusiones_sin_respuesta DESC, nombre`);
}
