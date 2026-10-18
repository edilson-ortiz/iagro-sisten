'use server';

import { revalidatePath } from 'next/cache';
import { requerirSesion } from '@/lib/auth';
import { query, registrarLog, sql } from '@/lib/db';
import type { Resultado } from '@/app/panel/(app)/usuarios/actions';

/** Saca al usuario de la pausa por alertas no leídas */
export async function reactivarAlertas(usuarioId: number): Promise<Resultado> {
  const sesion = await requerirSesion();
  if (!Number.isInteger(usuarioId) || usuarioId <= 0) return { ok: false, error: 'Usuario inválido.' };
  try {
    await query(sql`SELECT bot_clima.reactivar_alertas(${usuarioId}::bigint)`);
    await registrarLog('info', 'panel:alertas', 'Usuario reactivado para alertas', { usuarioId, admin: sesion.usuario });
  } catch (err) {
    return { ok: false, error: `No se pudo reactivar: ${(err as Error).message}` };
  }
  revalidatePath('/panel/alertas');
  revalidatePath('/panel/usuarios');
  revalidatePath(`/usuarios/${usuarioId}`);
  return { ok: true, mensaje: 'Volverá a recibir alertas de lluvia.' };
}

/** Activa o desactiva las alertas de lluvia de un usuario desde el panel */
export async function cambiarAlertas(usuarioId: number, activar: boolean): Promise<Resultado> {
  const sesion = await requerirSesion();
  if (!Number.isInteger(usuarioId) || usuarioId <= 0) return { ok: false, error: 'Usuario inválido.' };
  try {
    if (activar) await query(sql`SELECT bot_clima.reactivar_alertas(${usuarioId}::bigint)`);
    else await query(sql`SELECT bot_clima.desactivar_alertas(${usuarioId}::bigint, 'panel')`);
    await registrarLog('info', 'panel:alertas', activar ? 'Alertas activadas' : 'Alertas desactivadas', { usuarioId, admin: sesion.usuario });
  } catch (err) {
    return { ok: false, error: `No se pudo guardar: ${(err as Error).message}` };
  }
  revalidatePath('/panel/alertas');
  revalidatePath('/panel/usuarios');
  revalidatePath(`/usuarios/${usuarioId}`);
  return { ok: true, mensaje: activar ? 'Recibirá alertas de lluvia.' : 'Ya no recibirá alertas de lluvia.' };
}

/** Activa o desactiva las alertas de varios usuarios a la vez (selección en la lista de usuarios) */
export async function cambiarAlertasVarios(usuarioIds: number[], activar: boolean): Promise<Resultado> {
  const sesion = await requerirSesion();
  const ids = [...new Set(usuarioIds)].filter((id) => Number.isInteger(id) && id > 0);
  if (!ids.length) return { ok: false, error: 'No hay usuarios seleccionados.' };
  if (ids.length > 1000) return { ok: false, error: 'Máximo 1000 usuarios por vez.' };
  let cambiados: number;
  try {
    const lista = sql`(SELECT jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb)::bigint)`;
    const [r] = await query<{ n: number }>(activar
      ? sql`WITH x AS (
              SELECT bot_clima.reactivar_alertas(u.id) FROM bot_clima.usuarios u
               WHERE u.id IN ${lista} AND NOT u.alertas_activas)
            SELECT count(*)::int AS n FROM x`
      : sql`SELECT count(*) FILTER (WHERE bot_clima.desactivar_alertas(u.id, 'panel'))::int AS n
              FROM bot_clima.usuarios u WHERE u.id IN ${lista}`);
    cambiados = r!.n;
    await registrarLog('info', 'panel:alertas', activar ? 'Alertas activadas en lote' : 'Alertas desactivadas en lote',
      { usuarios: ids, cambiados, admin: sesion.usuario });
  } catch (err) {
    return { ok: false, error: `No se pudo guardar: ${(err as Error).message}` };
  }
  revalidatePath('/panel/alertas');
  revalidatePath('/panel/usuarios', 'layout');
  const sinCambio = ids.length - cambiados;
  return {
    ok: true,
    mensaje: `${activar ? 'Alertas activadas' : 'Alertas desactivadas'} a ${cambiados} usuario(s)`
      + (sinCambio ? ` · ${sinCambio} ya estaba(n) así.` : '.'),
  };
}
