import 'server-only';
import { query, sql } from '@/lib/db';
import type { AlertaFila } from '@/lib/datos';
import type { EstadoMensaje } from '@/lib/db/schema';

export type FiltrosAlertas = { q?: string; estado?: string; dias?: string };

export async function estadisticasAlertas(dias: number) {
  const [r] = await query<{
    total: number; entregadas: number; leidas: number; respondidas: number; fallidas: number; usuarios: number; bajas: number;
  }>(sql`
    SELECT count(*) FILTER (WHERE estado <> 'fallido')                    AS total,
           count(*) FILTER (WHERE estado IN ('entregado', 'leido'))        AS entregadas,
           count(*) FILTER (WHERE estado = 'leido')                        AS leidas,
           count(*) FILTER (WHERE respondio_el IS NOT NULL)                AS respondidas,
           count(*) FILTER (WHERE estado = 'fallido')                      AS fallidas,
           count(*) FILTER (WHERE lower(respuesta) = 'dejar de recibir')   AS bajas,
           count(DISTINCT usuario_id) FILTER (WHERE estado <> 'fallido')   AS usuarios
    FROM bot_clima.alertas_enviadas
    WHERE tipo = 'lluvia' AND enviada_el > now() - make_interval(days => ${dias}::int)`);
  return r!;
}

export async function historialAlertas(f: FiltrosAlertas) {
  const dias = [1, 7, 30, 90, 365].includes(Number(f.dias)) ? Number(f.dias) : 30;
  const estado = ['enviado', 'entregado', 'leido', 'fallido', 'respondio'].includes(f.estado ?? '') ? f.estado! : null;
  const q = f.q?.trim() ? `%${f.q.trim()}%` : null;
  return query<AlertaFila>(sql`
    SELECT a.*, u.nombre, u.telefono, u.zona
    FROM bot_clima.alertas_enviadas a JOIN bot_clima.usuarios u ON u.id = a.usuario_id
    WHERE a.tipo = 'lluvia'
      AND a.enviada_el > now() - make_interval(days => ${dias}::int)
      AND (${q}::text IS NULL OR u.nombre ILIKE ${q} OR u.telefono ILIKE ${q} OR u.zona ILIKE ${q})
      AND (${estado}::text IS NULL
           OR (${estado}::text = 'respondio' AND a.respondio_el IS NOT NULL)
           OR a.estado = ${estado}::text)
    ORDER BY a.enviada_el DESC
    LIMIT 500`);
}

export type BloqueadoFila = {
  id: number; nombre: string | null; telefono: string; zona: string | null;
  ultima_alerta_lluvia: string; alerta_bloqueada_hasta: string; alertas_7d: number;
};

/** Usuarios vigentes que no pueden recibir otra alerta todavía (tope semanal u horas mínimas) */
export async function usuariosBloqueados() {
  return query<BloqueadoFila>(sql`
    SELECT id, nombre, telefono, zona, ultima_alerta_lluvia, alerta_bloqueada_hasta, alertas_7d
    FROM bot_clima.v_usuarios
    WHERE vigente AND alerta_bloqueada_hasta > now()
    ORDER BY alerta_bloqueada_hasta`);
}

/** Cuántos vigentes están listos para recibir alerta y cuántos no tienen ubicación */
export async function coberturaAlertas() {
  const [r] = await query<{ listos: number; sin_ubicacion: number; no_vigentes: number }>(sql`
    SELECT count(*) FILTER (WHERE vigente AND latitud IS NOT NULL AND (alerta_bloqueada_hasta IS NULL OR alerta_bloqueada_hasta <= now())) AS listos,
           count(*) FILTER (WHERE vigente AND latitud IS NULL) AS sin_ubicacion,
           count(*) FILTER (WHERE activo AND NOT vigente) AS no_vigentes
    FROM bot_clima.v_usuarios`);
  return r!;
}

// ---------------------------------------------------------------- Próxima lluvia por usuario
export type ProximaFila = {
  id: number; nombre: string | null; telefono: string; zona: string | null; tiene_ubicacion: boolean;
  latitud: number | null; longitud: number | null;
  alertas_activas: boolean; alertas_desactivadas_por: 'panel' | 'usuario' | 'sin_respuesta' | null;
  alertas_sin_respuesta: number; alerta_bloqueada_hasta: string | null;
  proxima_lluvia: string | null; probabilidad: number | null; mm: number | null; horizonte_hasta: string | null;
  pronostico_error: string | null; consultado_el: string | null;
  alerta_id: number | null; alerta_enviada_el: string | null; alerta_estado: EstadoMensaje | null;
  alerta_probabilidad: number | null; alerta_hora_pronostico: string | null; alerta_respondio_el: string | null;
  alerta_respuesta: string | null; alerta_error: string | null;
};

/** Usuarios vigentes con su próxima lluvia (guardada por n8n cada hora) y su última alerta */
export async function proximasLluvias() {
  return query<ProximaFila>(sql`
    SELECT v.id, v.nombre, v.telefono, v.zona, v.latitud, v.longitud, (v.latitud IS NOT NULL AND v.longitud IS NOT NULL) AS tiene_ubicacion,
           v.alertas_activas, v.alertas_desactivadas_por, v.alertas_sin_respuesta::int AS alertas_sin_respuesta, v.alerta_bloqueada_hasta,
           p.proxima_lluvia, p.probabilidad, p.mm::float AS mm, p.horizonte_hasta, p.error AS pronostico_error, p.consultado_el,
           a.id AS alerta_id, a.enviada_el AS alerta_enviada_el, a.estado AS alerta_estado, a.probabilidad AS alerta_probabilidad,
           a.hora_pronostico AS alerta_hora_pronostico, a.respondio_el AS alerta_respondio_el, a.respuesta AS alerta_respuesta, a.error AS alerta_error
    FROM bot_clima.v_usuarios v
    LEFT JOIN bot_clima.pronosticos p ON p.usuario_id = v.id
    LEFT JOIN LATERAL (
      SELECT * FROM bot_clima.alertas_enviadas x
      WHERE x.usuario_id = v.id AND x.tipo = 'lluvia'
      ORDER BY x.enviada_el DESC LIMIT 1
    ) a ON true
    WHERE v.vigente
    ORDER BY p.proxima_lluvia NULLS LAST, lower(v.nombre) NULLS LAST, v.id`);
}

export async function pronosticoDeUsuario(id: number) {
  const [r] = await query<{ proxima_lluvia: string | null; probabilidad: number | null; mm: number | null; consultado_el: string; error: string | null }>(sql`
    SELECT proxima_lluvia, probabilidad, mm::float AS mm, consultado_el, error FROM bot_clima.pronosticos WHERE usuario_id = ${id}`);
  return r ?? null;
}
