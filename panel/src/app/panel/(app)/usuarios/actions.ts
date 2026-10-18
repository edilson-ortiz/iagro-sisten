'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requerirSesion } from '@/lib/auth';
import { query, registrarLog, sql } from '@/lib/db';
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
      radar AS (  -- el radar web (iagro360.xyz/radar/{id}) lee public.users
        UPDATE public.users SET latitude = ${d.latitud}, longitude = ${d.longitud}, updated_at = now()
         WHERE id IN (SELECT id FROM u) RETURNING id
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
