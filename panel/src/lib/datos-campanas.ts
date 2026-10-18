import 'server-only';
import { query, sql } from '@/lib/db';

export type EstadoCampana = 'programada' | 'enviando' | 'pausada' | 'enviada' | 'cancelada';
export type EstadoDestinatario = 'pendiente' | 'enviando' | 'enviado' | 'entregado' | 'leido' | 'fallido';

export type CampanaFila = {
  id: number; nombre: string; descripcion: string | null; inbox_id: number;
  plantilla_nombre: string; plantilla_idioma: string; plantilla_categoria: string | null; plantilla_cuerpo: string;
  mapeo: { telefono: string; nombre: string | null; variables: Record<string, { tipo: 'columna' | 'fijo'; valor: string }>; archivo?: string };
  estado: EstadoCampana; programada_para: string; iniciada_el: string | null; finalizada_el: string | null;
  created_at: string; creador: string | null;
  total: number; pendientes: number; enviados: number; entregados: number; leidos: number; fallidos: number;
  respondieron: number; primer_envio: string | null; ultimo_envio: string | null;
};

const CONTEOS = sql`
  LEFT JOIN LATERAL (
    SELECT count(*)                                                     AS total,
           count(*) FILTER (WHERE d.estado IN ('pendiente', 'enviando')) AS pendientes,
           count(*) FILTER (WHERE d.estado IN ('enviado', 'entregado', 'leido')) AS enviados,
           count(*) FILTER (WHERE d.estado IN ('entregado', 'leido'))    AS entregados,
           count(*) FILTER (WHERE d.estado = 'leido')                    AS leidos,
           count(*) FILTER (WHERE d.estado = 'fallido')                  AS fallidos,
           count(*) FILTER (WHERE d.respondio_el IS NOT NULL)            AS respondieron,
           min(d.enviado_el) AS primer_envio, max(d.enviado_el) AS ultimo_envio
      FROM bot_clima.campana_destinatarios d WHERE d.campana_id = c.id
  ) n ON true`;

export async function listarCampanas() {
  return query<CampanaFila>(sql`
    SELECT c.*, a.nombre AS creador, n.*
      FROM bot_clima.campanas c
      LEFT JOIN bot_clima.administradores a ON a.id = c.creada_por
      ${CONTEOS}
     ORDER BY c.created_at DESC
     LIMIT 200`);
}

export async function obtenerCampana(id: number) {
  const [c] = await query<CampanaFila>(sql`
    SELECT c.*, a.nombre AS creador, n.*
      FROM bot_clima.campanas c
      LEFT JOIN bot_clima.administradores a ON a.id = c.creada_por
      ${CONTEOS}
     WHERE c.id = ${id}`);
  return c ?? null;
}

export type DestinatarioFila = {
  id: number; telefono: string; nombre: string | null; parametros: Record<string, string>; estado: EstadoDestinatario;
  error: string | null; chatwoot_conversation_id: number | null; enviado_el: string | null; entregado_el: string | null;
  leido_el: string | null; respondio_el: string | null; respuesta: string | null; actualizado_el: string;
};

export const POR_PAGINA = 50;
const FILTROS = ['pendiente', 'enviado', 'entregado', 'leido', 'fallido', 'respondio'] as const;

function filtro(campanaId: number, f: { q?: string; estado?: string }) {
  const q = f.q?.trim() ? `%${f.q.trim()}%` : null;
  const estado = FILTROS.includes(f.estado as (typeof FILTROS)[number]) ? f.estado! : null;
  return sql`
    WHERE campana_id = ${campanaId}
      AND (${q}::text IS NULL OR telefono ILIKE ${q} OR nombre ILIKE ${q} OR parametros::text ILIKE ${q})
      AND CASE ${estado}::text
            WHEN 'respondio' THEN respondio_el IS NOT NULL
            WHEN 'pendiente' THEN estado IN ('pendiente', 'enviando')
            WHEN 'enviado'   THEN estado = 'enviado'
            WHEN 'entregado' THEN estado = 'entregado'
            WHEN 'leido'     THEN estado = 'leido'
            WHEN 'fallido'   THEN estado = 'fallido'
            ELSE true
          END`;
}

export async function destinatarios(campanaId: number, f: { q?: string; estado?: string; pagina?: number }) {
  const pagina = Math.max(1, f.pagina ?? 1);
  const [filas, [cuenta]] = await Promise.all([
    query<DestinatarioFila>(sql`
      SELECT id, telefono, nombre, parametros, estado, error, chatwoot_conversation_id, enviado_el, entregado_el,
             leido_el, respondio_el, respuesta, actualizado_el
        FROM bot_clima.campana_destinatarios ${filtro(campanaId, f)}
       ORDER BY actualizado_el DESC, id
       LIMIT ${POR_PAGINA} OFFSET ${(pagina - 1) * POR_PAGINA}`),
    query<{ n: number }>(sql`SELECT count(*)::int AS n FROM bot_clima.campana_destinatarios ${filtro(campanaId, f)}`),
  ]);
  return { filas, total: cuenta?.n ?? 0, pagina };
}

/** Todas las filas para exportar a CSV (respeta búsqueda y filtro) */
export async function destinatariosParaExportar(campanaId: number, f: { q?: string; estado?: string }) {
  return query<DestinatarioFila>(sql`
    SELECT id, telefono, nombre, parametros, estado, error, chatwoot_conversation_id, enviado_el, entregado_el,
           leido_el, respondio_el, respuesta, actualizado_el
      FROM bot_clima.campana_destinatarios ${filtro(campanaId, f)}
     ORDER BY id`);
}
