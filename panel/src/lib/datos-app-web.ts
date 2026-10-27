import 'server-only';
import { query, sql } from '@/lib/db';

/**
 * Datos del módulo "App y notificaciones": quién abrió el chat web, quién instaló la app
 * y quién activó las notificaciones (bot_clima.chat_web_clientes y chat_web_push).
 */

export type Segmento = 'avisos' | 'instalada';
export type FiltroAppWeb = 'todos' | Segmento;

export type FilaAppWeb = {
  telefono: string; usuario_id: number | null; nombre: string | null;
  primera_visita_el: string; ultima_visita_el: string; visitas: number;
  instalada_el: string | null; plataforma: string | null;
  dispositivos: number; avisos_desde: string | null;
};

export type DifusionPush = {
  id: number; titulo: string; texto: string; segmento: string;
  destinatarios: number; enviados: number; fallidos: number; admin: string | null; creado_el: string;
};

export async function resumenAppWeb() {
  const [r] = await query<{ personas: number; instaladas: number; con_avisos: number; dispositivos: number; activos_7d: number; difusiones: number }>(sql`
    SELECT (SELECT count(*) FROM bot_clima.chat_web_clientes)                                              AS personas,
           (SELECT count(*) FROM bot_clima.chat_web_clientes WHERE instalada_el IS NOT NULL)               AS instaladas,
           (SELECT count(DISTINCT telefono) FROM bot_clima.chat_web_push)                                  AS con_avisos,
           (SELECT count(*) FROM bot_clima.chat_web_push)                                                  AS dispositivos,
           (SELECT count(*) FROM bot_clima.chat_web_clientes WHERE ultima_visita_el > now() - interval '7 days') AS activos_7d,
           (SELECT count(*) FROM bot_clima.chat_web_difusiones)                                            AS difusiones`);
  return r ?? { personas: 0, instaladas: 0, con_avisos: 0, dispositivos: 0, activos_7d: 0, difusiones: 0 };
}

export async function listarAppWeb(filtro: FiltroAppWeb, buscar: string) {
  const q = buscar.trim();
  const digitos = q.replace(/\D/g, '');
  return query<FilaAppWeb>(sql`
    SELECT c.telefono, u.id AS usuario_id, u.nombre, c.primera_visita_el, c.ultima_visita_el, c.visitas,
           c.instalada_el, c.plataforma, COALESCE(p.n, 0)::int AS dispositivos, p.desde AS avisos_desde
      FROM bot_clima.chat_web_clientes c
      LEFT JOIN bot_clima.usuarios u ON u.telefono = c.telefono
      LEFT JOIN (SELECT telefono, count(*) AS n, min(creado_el) AS desde FROM bot_clima.chat_web_push GROUP BY telefono) p
             ON p.telefono = c.telefono
     WHERE (${filtro}::text = 'todos'
            OR (${filtro}::text = 'avisos' AND p.n > 0)
            OR (${filtro}::text = 'instalada' AND c.instalada_el IS NOT NULL))
       AND (${q}::text = ''
            OR (${digitos}::text <> '' AND c.telefono LIKE '%' || ${digitos}::text || '%')
            OR u.nombre ILIKE '%' || ${q}::text || '%')
     ORDER BY c.ultima_visita_el DESC
     LIMIT 500`);
}

/** Teléfonos con notificaciones activas del segmento (a quiénes llega una difusión) */
export async function telefonosConAvisos(segmento: Segmento) {
  const filas = await query<{ telefono: string }>(sql`
    SELECT DISTINCT p.telefono
      FROM bot_clima.chat_web_push p
      LEFT JOIN bot_clima.chat_web_clientes c ON c.telefono = p.telefono
     WHERE ${segmento}::text = 'avisos' OR c.instalada_el IS NOT NULL`);
  return filas.map((f) => f.telefono);
}

export async function contarDestinatarios() {
  const [r] = await query<{ avisos: number; instalada: number }>(sql`
    SELECT count(DISTINCT p.telefono) AS avisos,
           count(DISTINCT p.telefono) FILTER (WHERE c.instalada_el IS NOT NULL) AS instalada
      FROM bot_clima.chat_web_push p
      LEFT JOIN bot_clima.chat_web_clientes c ON c.telefono = p.telefono`);
  return r ?? { avisos: 0, instalada: 0 };
}

export async function historialDifusionesPush() {
  return query<DifusionPush>(sql`
    SELECT id, titulo, texto, segmento, destinatarios, enviados, fallidos, admin, creado_el
      FROM bot_clima.chat_web_difusiones ORDER BY creado_el DESC LIMIT 30`);
}
