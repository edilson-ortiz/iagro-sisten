'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requerirSesion } from '@/lib/auth';
import { db, query, registrarLog, sql } from '@/lib/db';
import { normalizarTelefono } from '@/lib/campanas/telefono';
import { fmtFecha } from '@/lib/utils';

export type Resultado = { ok: true; mensaje: string } | { ok: false; error: string };

const esquemaPago = z.object({
  usuarioId: z.coerce.number().int().positive(),
  planId: z.coerce.number().int().positive().nullable(),
  monto: z.coerce.number().min(0, 'El monto no puede ser negativo').max(100000),
  dias: z.coerce.number().int().min(1, 'Mínimo 1 día').max(3650),
  nota: z.string().trim().max(500).optional(),
});

export async function marcarPagado(entrada: z.input<typeof esquemaPago>): Promise<Resultado> {
  const sesion = await requerirSesion();
  const datos = esquemaPago.safeParse(entrada);
  if (!datos.success) return { ok: false, error: datos.error.issues[0]?.message ?? 'Datos inválidos' };
  const d = datos.data;

  try {
    const [pago] = await query<{ vence_nuevo: string; vence_anterior: string }>(sql`
      SELECT vence_nuevo, vence_anterior FROM bot_clima.registrar_pago(
        ${d.usuarioId}::bigint, ${d.planId}::bigint, ${d.monto}::numeric, ${d.dias}::int, ${sesion.adminId}::bigint, ${d.nota || null}::text)`);
    await registrarLog('info', 'panel:pagos', 'Pago registrado', { ...d, admin: sesion.usuario, vence_nuevo: pago!.vence_nuevo });
    revalidatePath('/panel/usuarios');
    revalidatePath(`/usuarios/${d.usuarioId}`);
    revalidatePath('/panel');
    return { ok: true, mensaje: `Pago registrado. Ahora vence el ${fmtFecha(pago!.vence_nuevo)}.` };
  } catch (err) {
    const msg = (err as Error).message;
    await registrarLog('error', 'panel:pagos', 'Error al registrar pago', { ...d, error: msg });
    return { ok: false, error: `No se pudo registrar el pago: ${msg}` };
  }
}

const esquemaEdicion = z.object({
  id: z.coerce.number().int().positive(),
  nombre: z.string().trim().max(150),
  zona: z.string().trim().max(120),
  notas: z.string().trim().max(2000),
  activo: z.boolean(),
});

export async function editarUsuario(entrada: z.input<typeof esquemaEdicion>): Promise<Resultado> {
  const sesion = await requerirSesion();
  const datos = esquemaEdicion.safeParse(entrada);
  if (!datos.success) return { ok: false, error: datos.error.issues[0]?.message ?? 'Datos inválidos' };
  const d = datos.data;
  try {
    await query(sql`
      UPDATE bot_clima.usuarios
         SET nombre = ${d.nombre || null}, zona = ${d.zona || null}, notas = ${d.notas || null}, activo = ${d.activo}
       WHERE id = ${d.id}`);
    await registrarLog('info', 'panel:usuarios', 'Usuario editado', { ...d, admin: sesion.usuario });
    revalidatePath('/panel/usuarios');
    revalidatePath(`/usuarios/${d.id}`);
    return { ok: true, mensaje: 'Datos guardados.' };
  } catch (err) {
    return { ok: false, error: `No se pudo guardar: ${(err as Error).message}` };
  }
}

const esquemaUbicacion = z.object({
  id: z.coerce.number().int().positive(),
  latitud: z.coerce.number().min(-90).max(90),
  longitud: z.coerce.number().min(-180).max(180),
});

/** Cambia las coordenadas GPS del campo del usuario (bot, radar web y pronóstico) */
export async function cambiarUbicacion(entrada: z.input<typeof esquemaUbicacion>): Promise<Resultado> {
  const sesion = await requerirSesion();
  const datos = esquemaUbicacion.safeParse(entrada);
  if (!datos.success) return { ok: false, error: 'Coordenadas inválidas.' };
  const d = datos.data;
  if (d.latitud === 0 && d.longitud === 0) return { ok: false, error: 'Coordenadas inválidas.' };
  try {
    // Una sola sentencia: se actualiza todo o nada
    const [r] = await query<{ lat_anterior: number | null; lon_anterior: number | null }>(sql`
      WITH antes AS (SELECT latitud, longitud FROM bot_clima.usuarios WHERE id = ${d.id}),
      u AS (
        UPDATE bot_clima.usuarios SET latitud = ${d.latitud}, longitud = ${d.longitud}, ubicacion_origen = 'panel'
         WHERE id = ${d.id} RETURNING id
      ),
      pron AS (   -- la próxima lluvia guardada era de la ubicación anterior: se recalcula en la próxima revisión
        DELETE FROM bot_clima.pronosticos WHERE usuario_id IN (SELECT id FROM u) RETURNING usuario_id
      )
      SELECT a.latitud AS lat_anterior, a.longitud AS lon_anterior FROM antes a, u`);
    if (!r) return { ok: false, error: 'Usuario no encontrado.' };
    await registrarLog('info', 'panel:usuarios', 'Ubicación cambiada', {
      id: d.id, anterior: [r.lat_anterior, r.lon_anterior], nueva: [d.latitud, d.longitud], admin: sesion.usuario,
    });
  } catch (err) {
    return { ok: false, error: `No se pudo guardar: ${(err as Error).message}` };
  }
  revalidatePath('/panel/usuarios');
  revalidatePath(`/usuarios/${d.id}`);
  revalidatePath('/panel/alertas');
  return { ok: true, mensaje: 'Ubicación actualizada. El pronóstico se recalcula en la próxima revisión (cada hora).' };
}

const esquemaNuevo = z.object({
  telefono: z.string().trim().min(1, 'Escribe el teléfono.').max(40),
  nombre: z.string().trim().max(150),
  zona: z.string().trim().max(120),
  notas: z.string().trim().max(2000),
  latitud: z.coerce.number().min(-90).max(90).nullable(),
  longitud: z.coerce.number().min(-180).max(180).nullable(),
  /** null = prueba gratis; si no, el pago inicial (plan o personalizado) */
  pago: z.object({
    planId: z.coerce.number().int().positive().nullable(),
    monto: z.coerce.number().min(0, 'El monto no puede ser negativo').max(100000),
    dias: z.coerce.number().int().min(1, 'Mínimo 1 día').max(3650),
  }).nullable(),
});

/** Alta manual desde el panel: misma ficha (bot_clima.usuarios) que usan el bot, el radar y las alertas */
export async function crearUsuario(entrada: z.input<typeof esquemaNuevo>): Promise<Resultado & { id?: number; existente?: boolean }> {
  const sesion = await requerirSesion();
  const datos = esquemaNuevo.safeParse(entrada);
  if (!datos.success) return { ok: false, error: datos.error.issues[0]?.message ?? 'Datos inválidos' };
  const d = datos.data;

  const telefono = normalizarTelefono(d.telefono);
  if (!telefono) return { ok: false, error: 'Teléfono inválido. Escribe el celular (8 dígitos) o el número con código de país.' };
  const conUbicacion = d.latitud != null && d.longitud != null && !(d.latitud === 0 && d.longitud === 0);

  const [ya] = await query<{ id: number; nombre: string | null }>(sql`SELECT id, nombre FROM bot_clima.usuarios WHERE telefono = ${telefono}`);
  if (ya) return { ok: false, existente: true, id: ya.id, error: `Ese teléfono ya está registrado (${ya.nombre ?? 'sin nombre'}).` };

  try {
    // Todo o nada: alta + notas + pago inicial
    const id = await db.transaction(async (tx) => {
      const { rows } = await tx.execute<{ usuario_id: number }>(sql`
        SELECT usuario_id FROM bot_clima.registrar_usuario(
          ${telefono}::text, ${d.nombre || null}::text,
          ${conUbicacion ? d.latitud : null}::double precision, ${conUbicacion ? d.longitud : null}::double precision,
          ${d.zona || null}::text, 'panel'::text, NULL::bigint)`);
      const uid = Number(rows[0]!.usuario_id);
      if (d.notas) await tx.execute(sql`UPDATE bot_clima.usuarios SET notas = ${d.notas} WHERE id = ${uid}`);
      if (d.pago) {
        // Pagó desde el alta: los días cuentan desde hoy, no se suman a la prueba
        await tx.execute(sql`UPDATE bot_clima.usuarios SET vence_el = bot_clima.hoy() WHERE id = ${uid}`);
        await tx.execute(sql`
          SELECT bot_clima.registrar_pago(${uid}::bigint, ${d.pago.planId}::bigint, ${d.pago.monto}::numeric,
                                          ${d.pago.dias}::int, ${sesion.adminId}::bigint, 'Alta desde el panel'::text)`);
      }
      return uid;
    });
    await registrarLog('info', 'panel:usuarios', 'Usuario creado', { id, telefono, nombre: d.nombre, pago: d.pago, admin: sesion.usuario });
    revalidatePath('/panel/usuarios');
    revalidatePath('/panel');
    return { ok: true, id, mensaje: d.pago ? 'Usuario creado con su pago registrado.' : 'Usuario creado en prueba gratis.' };
  } catch (err) {
    const msg = (err as Error).message;
    await registrarLog('error', 'panel:usuarios', 'Error al crear usuario', { telefono, error: msg });
    return { ok: false, error: `No se pudo crear: ${msg}` };
  }
}
