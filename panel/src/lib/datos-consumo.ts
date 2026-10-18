import 'server-only';
import { query, sql } from '@/lib/db';

export type ConsumoFila = {
  id: number; nombre: string | null; telefono: string; zona: string | null; estado: string; activo: boolean;
  chatwoot_contact_id: number | null; plan: string | null; limite: number;
  usados: number; plantillas: number; fallidos: number; ultimo_envio: string | null;
  /** Solo en la vista por ciclo: [inicio, fin) en fechas locales */
  inicio?: string; fin?: string;
};

export type Sincronizacion = {
  ejecutada_el: string; duracion_ms: number; usuarios: number; mensajes: number;
  errores: { usuario_id: number; nombre: string | null; error: string }[]; admin: string | null;
};

/** Rango del mes 'YYYY-MM' en la zona horaria configurada */
const rango = (mes: string) => sql`
  r AS (SELECT to_date(${mes} || '-01', 'YYYY-MM-DD')::timestamp AS mes,
               bot_clima.cfg_texto('zona_horaria', 'America/La_Paz') AS z),
  b AS (SELECT mes AT TIME ZONE z AS desde, (mes + interval '1 month') AT TIME ZONE z AS hasta FROM r)`;

/** Mes actual 'YYYY-MM' y los 5 anteriores */
export async function mesesConsumo() {
  const filas = await query<{ v: string }>(sql`
    SELECT to_char(date_trunc('month', bot_clima.hoy()) - make_interval(months => n), 'YYYY-MM') AS v
    FROM generate_series(0, 5) n`);
  return filas.map((f) => f.v);
}

export async function consumoMensual(mes: string) {
  return query<ConsumoFila>(sql`
    WITH ${rango(mes)},
    c AS (
      SELECT m.usuario_id,
             count(*) FILTER (WHERE m.estado <> 'failed')                AS usados,
             count(*) FILTER (WHERE m.estado <> 'failed' AND m.plantilla) AS plantillas,
             count(*) FILTER (WHERE m.estado = 'failed')                 AS fallidos,
             max(m.enviado_el)                                           AS ultimo_envio
        FROM bot_clima.mensajes_salientes m, b
       WHERE m.enviado_el >= b.desde AND m.enviado_el < b.hasta
       GROUP BY m.usuario_id
    )
    SELECT u.id, u.nombre, u.telefono, u.zona, u.estado, u.activo, u.chatwoot_contact_id,
           (SELECT pl.nombre FROM bot_clima.pagos p JOIN bot_clima.planes pl ON pl.id = p.plan_id
             WHERE p.usuario_id = u.id ORDER BY p.fecha DESC LIMIT 1) AS plan,
           bot_clima.limite_tokens(u.id) AS limite,
           COALESCE(c.usados, 0) AS usados, COALESCE(c.plantillas, 0) AS plantillas,
           COALESCE(c.fallidos, 0) AS fallidos, c.ultimo_envio
      FROM bot_clima.usuarios u
      LEFT JOIN c ON c.usuario_id = u.id
     WHERE u.activo OR c.usados > 0
     ORDER BY COALESCE(c.usados, 0) DESC, lower(u.nombre), u.id`);
}

/** Ciclo actual de cada usuario activo (el control real de tokens) */
export async function consumoCiclo() {
  return query<ConsumoFila>(sql`
    WITH t AS (SELECT bot_clima.cfg_texto('zona_horaria', 'America/La_Paz') AS z)
    SELECT u.id, u.nombre, u.telefono, u.zona, u.estado, u.activo, u.chatwoot_contact_id,
           (SELECT pl.nombre FROM bot_clima.pagos p JOIN bot_clima.planes pl ON pl.id = p.plan_id
             WHERE p.usuario_id = u.id ORDER BY p.fecha DESC LIMIT 1) AS plan,
           l.limite, c.inicio::text AS inicio, c.fin::text AS fin,
           COALESCE(m.usados, 0) AS usados, COALESCE(m.plantillas, 0) AS plantillas,
           COALESCE(m.fallidos, 0) AS fallidos, m.ultimo_envio
      FROM bot_clima.usuarios u
      CROSS JOIN t
      CROSS JOIN LATERAL bot_clima.ciclo_tokens(u.id) c
      CROSS JOIN LATERAL (SELECT bot_clima.limite_tokens(u.id) AS limite) l
      LEFT JOIN LATERAL (
        SELECT count(*) FILTER (WHERE x.estado <> 'failed')                AS usados,
               count(*) FILTER (WHERE x.estado <> 'failed' AND x.plantilla) AS plantillas,
               count(*) FILTER (WHERE x.estado = 'failed')                 AS fallidos,
               max(x.enviado_el)                                           AS ultimo_envio
          FROM bot_clima.mensajes_salientes x
         WHERE x.usuario_id = u.id
           AND x.enviado_el >= (c.inicio::timestamp AT TIME ZONE t.z)
           AND x.enviado_el <  (c.fin::timestamp AT TIME ZONE t.z)
      ) m ON true
     WHERE u.activo
     ORDER BY COALESCE(m.usados, 0)::numeric / GREATEST(l.limite, 1) DESC, lower(u.nombre), u.id`);
}

export async function ultimaSincronizacion(mes?: string) {
  const [s] = await query<Sincronizacion>(sql`
    SELECT s.ejecutada_el, s.duracion_ms, s.usuarios, s.mensajes, s.errores, a.nombre AS admin
      FROM bot_clima.consumo_sincronizaciones s
      LEFT JOIN bot_clima.administradores a ON a.id = s.admin_id
     WHERE ${mes ?? null}::text IS NULL OR s.mes = to_date(${mes ?? null}::text || '-01', 'YYYY-MM-DD')
     ORDER BY s.ejecutada_el DESC LIMIT 1`);
  return s ?? null;
}

/** Inicio y fin del mes en milisegundos (para filtrar lo que trae Chatwoot) */
export async function rangoMes(mes: string) {
  const [r] = await query<{ desde: number; hasta: number }>(sql`
    WITH ${rango(mes)}
    SELECT (extract(epoch FROM desde) * 1000)::bigint AS desde, (extract(epoch FROM hasta) * 1000)::bigint AS hasta FROM b`);
  return r!;
}

/** Ciclo actual de un usuario (ficha) */
export async function consumoDeUsuario(id: number) {
  const [r] = await query<{ inicio: string; fin: string; usados: number; limite: number; restantes: number }>(sql`
    SELECT inicio::text, fin::text, usados, limite, restantes FROM bot_clima.tokens_ciclo(${id}::bigint)`);
  return r ?? null;
}
