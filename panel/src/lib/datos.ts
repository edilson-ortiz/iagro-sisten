import 'server-only';
import { query, sql } from '@/lib/db';
import type { EstadoMensaje, EstadoUsuario, Plan } from '@/lib/db/schema';

export type UsuarioFila = {
  id: number;
  chatwoot_contact_id: number | null;
  telefono: string;
  nombre: string | null;
  latitud: number | null;
  longitud: number | null;
  zona: string | null;
  ubicacion_origen: string | null;
  fecha_registro: string;
  estado: EstadoUsuario;
  vence_el: string;
  ultima_alerta_lluvia: string | null;
  activo: boolean;
  notas: string | null;
  dias_restantes: number;
  vigente: boolean;
  alerta_bloqueada_hasta: string | null;
  ultimo_pago: string | null;
  total_pagado: number;
  cantidad_pagos: number;
  alertas_7d: number;
  ultimo_mensaje_el: string | null;
  difusiones_sin_respuesta: number;
  difusion_pausada: boolean;
  alertas_sin_respuesta: number;
  alertas_activas: boolean;
  alertas_desactivadas_el: string | null;
  alertas_desactivadas_por: 'panel' | 'usuario' | 'sin_respuesta' | null;
  alertas_reactivado_el: string | null;
};

// ---------------------------------------------------------------- Inicio
export async function resumenInicio() {
  const [r] = await query<{
    total: number; prueba: number; pagado: number; vencido: number; inactivos: number;
    pruebas_vencen_semana: number; alertas_semana: number; alertas_leidas_semana: number;
    ingresos_mes: number; pagos_mes: number; nuevos_mes: number;
  }>(sql`
    WITH semana AS (
      SELECT date_trunc('week', now() AT TIME ZONE bot_clima.cfg_texto('zona_horaria', 'America/La_Paz'))
               AT TIME ZONE bot_clima.cfg_texto('zona_horaria', 'America/La_Paz') AS desde
    ), mes AS (
      SELECT date_trunc('month', now() AT TIME ZONE bot_clima.cfg_texto('zona_horaria', 'America/La_Paz'))
               AT TIME ZONE bot_clima.cfg_texto('zona_horaria', 'America/La_Paz') AS desde
    )
    SELECT
      count(*) FILTER (WHERE activo)                                     AS total,
      count(*) FILTER (WHERE activo AND estado = 'prueba')               AS prueba,
      count(*) FILTER (WHERE activo AND estado = 'pagado')               AS pagado,
      count(*) FILTER (WHERE activo AND estado = 'vencido')              AS vencido,
      count(*) FILTER (WHERE NOT activo)                                 AS inactivos,
      count(*) FILTER (WHERE activo AND estado = 'prueba' AND dias_restantes BETWEEN 0 AND 7) AS pruebas_vencen_semana,
      (SELECT count(*) FROM bot_clima.alertas_enviadas, semana WHERE enviada_el >= semana.desde AND estado <> 'fallido') AS alertas_semana,
      (SELECT count(*) FROM bot_clima.alertas_enviadas, semana WHERE enviada_el >= semana.desde AND estado = 'leido')    AS alertas_leidas_semana,
      (SELECT COALESCE(sum(monto), 0) FROM bot_clima.pagos, mes WHERE fecha >= mes.desde) AS ingresos_mes,
      (SELECT count(*) FROM bot_clima.pagos, mes WHERE fecha >= mes.desde)                AS pagos_mes,
      (SELECT count(*) FROM bot_clima.usuarios, mes WHERE fecha_registro >= mes.desde)    AS nuevos_mes
    FROM bot_clima.v_usuarios`);
  return r!;
}

/** Registros y conversiones (primer pago) por mes, últimos 12 meses. */
export async function serieMensual() {
  return query<{ mes: string; registros: number; conversiones: number }>(sql`
    WITH tz AS (SELECT bot_clima.cfg_texto('zona_horaria', 'America/La_Paz') AS z),
    meses AS (
      SELECT generate_series(
        date_trunc('month', (now() AT TIME ZONE (SELECT z FROM tz))) - interval '11 months',
        date_trunc('month', (now() AT TIME ZONE (SELECT z FROM tz))),
        interval '1 month')::date AS mes
    ),
    primeros AS (
      SELECT usuario_id, min(fecha) AS fecha FROM bot_clima.pagos GROUP BY usuario_id
    )
    SELECT to_char(m.mes, 'YYYY-MM') AS mes,
      (SELECT count(*) FROM bot_clima.usuarios u
        WHERE date_trunc('month', u.fecha_registro AT TIME ZONE (SELECT z FROM tz))::date = m.mes) AS registros,
      (SELECT count(*) FROM primeros p
        WHERE date_trunc('month', p.fecha AT TIME ZONE (SELECT z FROM tz))::date = m.mes) AS conversiones
    FROM meses m ORDER BY m.mes`);
}

export async function proximosVencimientos(limite = 6) {
  return query<UsuarioFila>(sql`
    SELECT * FROM bot_clima.v_usuarios
    WHERE activo AND estado <> 'vencido' AND dias_restantes BETWEEN 0 AND 7
    ORDER BY vence_el, nombre LIMIT ${limite}`);
}

export async function ultimasAlertas(limite = 6) {
  return query<AlertaFila>(sql`
    SELECT a.*, u.nombre, u.telefono, u.zona
    FROM bot_clima.alertas_enviadas a JOIN bot_clima.usuarios u ON u.id = a.usuario_id
    ORDER BY a.enviada_el DESC LIMIT ${limite}`);
}

// ---------------------------------------------------------------- Usuarios
export type FiltrosUsuarios = { q?: string; estado?: string; zona?: string; orden?: string };

export async function listarUsuarios(f: FiltrosUsuarios) {
  const q = f.q?.trim() ? `%${f.q.trim()}%` : null;
  const estado = ['prueba', 'pagado', 'vencido', 'inactivo', 'por_vencer', 'sin_alertas'].includes(f.estado ?? '') ? f.estado! : null;
  const zona = f.zona?.trim() || null;
  const orden =
    f.orden === 'nombre' ? sql`lower(nombre) NULLS LAST` :
    f.orden === 'registro' ? sql`fecha_registro DESC` :
    f.orden === 'alerta' ? sql`ultima_alerta_lluvia DESC NULLS LAST` :
    sql`(estado = 'vencido'), vence_el`;

  return query<UsuarioFila>(sql`
    SELECT * FROM bot_clima.v_usuarios
    WHERE (${q}::text IS NULL OR nombre ILIKE ${q} OR telefono ILIKE ${q} OR zona ILIKE ${q})
      AND (${zona}::text IS NULL OR lower(zona) = lower(${zona}))
      AND CASE ${estado}::text
            WHEN 'inactivo'   THEN NOT activo
            WHEN 'por_vencer' THEN activo AND estado <> 'vencido' AND dias_restantes BETWEEN 0 AND 7
            WHEN 'sin_alertas' THEN activo AND NOT alertas_activas
            WHEN 'prueba'     THEN activo AND estado = 'prueba'
            WHEN 'pagado'     THEN activo AND estado = 'pagado'
            WHEN 'vencido'    THEN activo AND estado = 'vencido'
            ELSE true
          END
    ORDER BY ${orden}, id
    LIMIT 500`);
}

export async function conteoPorEstado() {
  const [r] = await query<Record<'todos' | 'prueba' | 'pagado' | 'vencido' | 'por_vencer' | 'inactivo' | 'sin_alertas', number>>(sql`
    SELECT count(*) AS todos,
      count(*) FILTER (WHERE activo AND estado = 'prueba')  AS prueba,
      count(*) FILTER (WHERE activo AND estado = 'pagado')  AS pagado,
      count(*) FILTER (WHERE activo AND estado = 'vencido') AS vencido,
      count(*) FILTER (WHERE activo AND estado <> 'vencido' AND dias_restantes BETWEEN 0 AND 7) AS por_vencer,
      count(*) FILTER (WHERE NOT activo) AS inactivo,
      count(*) FILTER (WHERE activo AND NOT alertas_activas) AS sin_alertas
    FROM bot_clima.v_usuarios`);
  return r!;
}

export async function listarZonas() {
  const filas = await query<{ zona: string; n: number }>(sql`
    SELECT min(zona) AS zona, count(*) AS n FROM bot_clima.usuarios
    WHERE zona IS NOT NULL AND trim(zona) <> '' GROUP BY lower(zona) ORDER BY 1`);
  return filas;
}

export async function obtenerUsuario(id: number) {
  const [u] = await query<UsuarioFila>(sql`SELECT * FROM bot_clima.v_usuarios WHERE id = ${id}`);
  return u ?? null;
}

export type PagoFila = {
  id: number; fecha: string; monto: number; moneda: string; dias_agregados: number;
  vence_anterior: string | null; vence_nuevo: string; nota: string | null; plan: string | null; admin: string | null;
};
export async function pagosDeUsuario(id: number) {
  return query<PagoFila>(sql`
    SELECT p.id, p.fecha, p.monto, p.moneda, p.dias_agregados, p.vence_anterior, p.vence_nuevo, p.nota,
           pl.nombre AS plan, a.nombre AS admin
    FROM bot_clima.pagos p
    LEFT JOIN bot_clima.planes pl ON pl.id = p.plan_id
    LEFT JOIN bot_clima.administradores a ON a.id = p.registrado_por
    WHERE p.usuario_id = ${id} ORDER BY p.fecha DESC`);
}

export type AlertaFila = {
  id: number; usuario_id: number; tipo: string; probabilidad: number | null; hora_pronostico: string | null;
  enviada_el: string; estado: EstadoMensaje; entregado_el: string | null; leido_el: string | null;
  respondio_el: string | null; respuesta: string | null; error: string | null; nombre?: string | null; telefono?: string; zona?: string | null;
};
export async function alertasDeUsuario(id: number) {
  return query<AlertaFila>(sql`
    SELECT * FROM bot_clima.alertas_enviadas WHERE usuario_id = ${id} ORDER BY enviada_el DESC LIMIT 50`);
}

export type EnvioFila = {
  difusion_id: number; titulo: string; enviado_el: string | null; enviado: boolean; entregado: boolean;
  leido: boolean; respondio: boolean; error: string | null;
};
export async function difusionesDeUsuario(id: number) {
  return query<EnvioFila>(sql`
    SELECT e.difusion_id, d.titulo, e.enviado_el, e.enviado, e.entregado, e.leido, e.respondio, e.error
    FROM bot_clima.difusion_envios e JOIN bot_clima.difusiones d ON d.id = e.difusion_id
    WHERE e.usuario_id = ${id} ORDER BY COALESCE(e.enviado_el, e.created_at) DESC LIMIT 50`);
}

export async function planesActivos() {
  return query<Pick<Plan, 'id' | 'nombre' | 'dias' | 'moneda'> & { monto: number }>(sql`
    SELECT id, nombre, dias, monto, moneda FROM bot_clima.planes WHERE activo ORDER BY orden, id`);
}

/** Días de prueba gratis que recibe un usuario nuevo (Configuración) */
export async function diasPrueba() {
  const [r] = await query<{ dias: number }>(sql`SELECT bot_clima.cfg_num('prueba_dias', 30)::int AS dias`);
  return r?.dias ?? 30;
}

/** Fecha de hoy (YYYY-MM-DD) en la zona horaria configurada */
export async function hoyLocal() {
  const [r] = await query<{ hoy: string }>(sql`SELECT bot_clima.hoy()::text AS hoy`);
  return r!.hoy;
}

export async function datosChatwoot() {
  const [r] = await query<{ url: string; cuenta: string }>(sql`
    SELECT bot_clima.cfg_texto('chatwoot_url_publica', '') AS url, bot_clima.cfg_texto('chatwoot_account_id', '') AS cuenta`);
  return r!;
}

/** Nivel de alertas, invitaciones y si pidió no recibir mensajes (ficha) */
export async function extrasDeUsuario(id: number) {
  const [r] = await query<{
    alertas_nivel: 'todas' | 'fuertes'; codigo_referido: string | null; amigos: number; premios: number;
    invitado_por_id: number | null; invitado_por: string | null; de_baja: boolean;
  }>(sql`
    SELECT u.alertas_nivel, u.codigo_referido, u.referidos_premiados AS premios,
           (SELECT count(*) FROM bot_clima.usuarios x WHERE x.referido_por = u.id)::int AS amigos,
           u.referido_por AS invitado_por_id, p.nombre AS invitado_por,
           EXISTS (SELECT 1 FROM bot_clima.bajas_whatsapp b WHERE b.telefono = u.telefono) AS de_baja
      FROM bot_clima.usuarios u
      LEFT JOIN bot_clima.usuarios p ON p.id = u.referido_por
     WHERE u.id = ${id}`);
  return r ?? null;
}
