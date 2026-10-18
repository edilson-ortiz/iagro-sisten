'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requerirSesion } from '@/lib/auth';
import { query, registrarLog, sql } from '@/lib/db';
import { contarSegmento, muestraSegmento, type Segmento } from '@/lib/datos-difusiones';
import type { Resultado } from '@/app/panel/(app)/usuarios/actions';

const SEGMENTOS = ['todos', 'prueba', 'pagado', 'vencido', 'zona'] as const;

export async function vistaPreviaSegmento(segmento: Segmento, zona: string | null) {
  await requerirSesion();
  if (!SEGMENTOS.includes(segmento)) return { destinatarios: 0, pausados: 0, muestra: [] };
  const z = segmento === 'zona' ? zona : null;
  const [conteo, muestra] = await Promise.all([contarSegmento(segmento, z), muestraSegmento(segmento, z)]);
  return { ...conteo, muestra };
}

const esquema = z.object({
  titulo: z.string().trim().min(3, 'Escribe un título (solo lo ves tú)').max(150),
  mensaje: z.string().trim().min(5, 'El mensaje es muy corto').max(1000, 'Máximo 1000 caracteres'),
  segmento: z.enum(SEGMENTOS),
  zona: z.string().trim().max(120).optional(),
  plantilla: z.string().trim().max(120).optional(),
});

/** Crea la difusión (borrador) y, si se pide, la envía de inmediato */
export async function crearDifusion(entrada: z.input<typeof esquema>, enviar: boolean): Promise<Resultado & { id?: number }> {
  const sesion = await requerirSesion();
  const d = esquema.safeParse(entrada);
  if (!d.success) return { ok: false, error: d.error.issues[0]?.message ?? 'Datos inválidos' };
  const v = d.data;
  if (v.segmento === 'zona' && !v.zona) return { ok: false, error: 'Elige la zona.' };
  if (v.plantilla && !/^[a-z0-9_]+$/.test(v.plantilla)) {
    return { ok: false, error: 'El nombre de plantilla solo admite minúsculas, números y guion bajo (como en Meta).' };
  }

  const [nueva] = await query<{ id: number }>(sql`
    INSERT INTO bot_clima.difusiones (titulo, mensaje, segmento, segmento_zona, plantilla, creada_por)
    VALUES (${v.titulo}, ${v.mensaje}, ${v.segmento}, ${v.segmento === 'zona' ? v.zona! : null}, ${v.plantilla || null}, ${sesion.adminId})
    RETURNING id`);
  await registrarLog('info', 'panel:difusiones', 'Difusión creada', { id: nueva!.id, admin: sesion.usuario });
  revalidatePath('/panel/difusiones');

  if (!enviar) return { ok: true, mensaje: 'Borrador guardado.', id: nueva!.id };
  const r = await dispararEnvio(nueva!.id, sesion.usuario);
  return { ...r, id: nueva!.id };
}

export async function enviarDifusion(id: number): Promise<Resultado> {
  const sesion = await requerirSesion();
  return dispararEnvio(id, sesion.usuario);
}

/** Llama al webhook de n8n con el token compartido (ambos guardados en la base) */
async function dispararEnvio(id: number, admin: string): Promise<Resultado> {
  const [cfg] = await query<{ url: string; token: string; estado: string }>(sql`
    SELECT bot_clima.cfg_texto('n8n_webhook_difusion', '') AS url, bot_clima.cfg_texto('n8n_token', '') AS token,
           (SELECT estado FROM bot_clima.difusiones WHERE id = ${id}) AS estado`);
  if (!cfg?.estado) return { ok: false, error: 'La difusión no existe.' };
  if (!['borrador', 'error'].includes(cfg.estado)) return { ok: false, error: `La difusión ya está "${cfg.estado}".` };
  if (!cfg.url) {
    return { ok: false, error: 'Falta la URL del webhook de n8n (Configuración → Integraciones). La difusión quedó como borrador.' };
  }

  try {
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-iagro-token': cfg.token },
      body: JSON.stringify({ difusion_id: id }),
      signal: AbortSignal.timeout(20_000),
      cache: 'no-store',
    });
    const cuerpo = (await res.json().catch(() => ({}))) as { ok?: boolean; destinatarios?: number; error?: string };
    if (!res.ok || cuerpo.ok === false) {
      const msg = cuerpo.error || `n8n respondió ${res.status}`;
      await registrarLog('error', 'panel:difusiones', 'n8n rechazó la difusión', { id, admin, error: msg });
      return { ok: false, error: `No se pudo enviar: ${msg}` };
    }
    await registrarLog('info', 'panel:difusiones', 'Difusión enviada a n8n', { id, admin, destinatarios: cuerpo.destinatarios });
    revalidatePath('/panel/difusiones');
    revalidatePath(`/difusiones/${id}`);
    return {
      ok: true,
      mensaje: cuerpo.destinatarios === 0 ? 'No había destinatarios en ese segmento.' : `Enviando a ${cuerpo.destinatarios ?? '?'} usuario(s). Los estados se actualizan solos.`,
    };
  } catch (err) {
    const msg = (err as Error).name === 'TimeoutError' ? 'n8n no respondió a tiempo' : (err as Error).message;
    await registrarLog('error', 'panel:difusiones', 'No se pudo contactar a n8n', { id, admin, error: msg });
    return { ok: false, error: `No se pudo contactar a n8n (${msg}). La difusión quedó como borrador.` };
  }
}

export async function crearReenvio(id: number): Promise<Resultado & { id?: number }> {
  const sesion = await requerirSesion();
  try {
    const [r] = await query<{ id: number; total_destinatarios: number }>(sql`
      SELECT id, total_destinatarios FROM bot_clima.crear_reenvio_no_respondieron(${id}::bigint, ${sesion.adminId}::bigint)`);
    if (!r!.total_destinatarios) {
      await query(sql`DELETE FROM bot_clima.difusiones WHERE id = ${r!.id}`);
      return { ok: false, error: 'Todos respondieron: no hay a quién reenviar. 🎉' };
    }
    revalidatePath('/panel/difusiones');
    return { ok: true, mensaje: `Reenvío creado para ${r!.total_destinatarios} usuario(s). Revísalo y toca Enviar.`, id: r!.id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function eliminarBorrador(id: number): Promise<Resultado> {
  await requerirSesion();
  const [r] = await query<{ id: number }>(sql`DELETE FROM bot_clima.difusiones WHERE id = ${id} AND estado = 'borrador' RETURNING id`);
  if (!r) return { ok: false, error: 'Solo se pueden eliminar borradores.' };
  revalidatePath('/panel/difusiones');
  return { ok: true, mensaje: 'Borrador eliminado.' };
}

export async function reactivarUsuario(usuarioId: number): Promise<Resultado> {
  const sesion = await requerirSesion();
  await query(sql`SELECT bot_clima.reactivar_difusiones(${usuarioId}::bigint)`);
  await registrarLog('info', 'panel:difusiones', 'Usuario reactivado para difusiones', { usuarioId, admin: sesion.usuario });
  revalidatePath('/panel/difusiones');
  revalidatePath('/panel/usuarios');
  revalidatePath(`/usuarios/${usuarioId}`);
  return { ok: true, mensaje: 'Volverá a recibir difusiones.' };
}
