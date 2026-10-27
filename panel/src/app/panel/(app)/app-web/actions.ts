'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requerirSesion } from '@/lib/auth';
import { query, registrarLog, sql } from '@/lib/db';
import { difundirPush } from '@/lib/chat-push';
import { telefonosConAvisos } from '@/lib/datos-app-web';
import { normalizarTelefono } from '@/lib/campanas/telefono';
import type { Resultado } from '@/app/panel/(app)/usuarios/actions';

const esquema = z.object({
  titulo: z.string().trim().min(1, 'Escribe un título').max(60, 'El título es muy largo (máximo 60)'),
  texto: z.string().trim().min(1, 'Escribe el mensaje').max(240, 'El mensaje es muy largo (máximo 240)'),
  segmento: z.enum(['avisos', 'instalada', 'numero']),
  numero: z.string().optional(),
});

/** Difusión por notificación push a quienes activaron las notificaciones del chat web */
export async function enviarDifusionPush(entrada: z.input<typeof esquema>): Promise<Resultado> {
  const sesion = await requerirSesion();
  const d = esquema.safeParse(entrada);
  if (!d.success) return { ok: false, error: d.error.issues[0]?.message ?? 'Datos inválidos.' };
  const { titulo, texto, segmento } = d.data;

  let telefonos: string[];
  if (segmento === 'numero') {
    const tel = normalizarTelefono(d.data.numero);
    if (!tel) return { ok: false, error: 'Escribe un número válido (ej. 76098116).' };
    telefonos = [tel];
  } else {
    telefonos = await telefonosConAvisos(segmento);
  }
  if (!telefonos.length) return { ok: false, error: 'Nadie de este grupo tiene las notificaciones activas.' };

  try {
    const r = await difundirPush(telefonos, titulo, texto);
    await query(sql`
      INSERT INTO bot_clima.chat_web_difusiones (titulo, texto, segmento, destinatarios, enviados, fallidos, admin)
      VALUES (${titulo}, ${texto}, ${segmento}, ${telefonos.length}, ${r.personas}, ${telefonos.length - r.personas}, ${sesion.nombre})`);
    await registrarLog('info', 'panel:app-web', 'Difusión por notificación', { titulo, segmento, destinatarios: telefonos.length, ...r, admin: sesion.usuario });
    revalidatePath('/panel/app-web');
    if (!r.personas) {
      return { ok: false, error: segmento === 'numero' ? 'Ese número no tiene las notificaciones activas.' : 'No llegó a nadie: los navegadores rechazaron el aviso.' };
    }
    const sinLlegar = telefonos.length - r.personas;
    return { ok: true, mensaje: `Notificación enviada a ${r.personas} persona(s)${sinLlegar ? ` · ${sinLlegar} sin llegar (desinstalaron o quitaron el permiso)` : ''}.` };
  } catch (err) {
    return { ok: false, error: `No se pudo enviar: ${(err as Error).message}` };
  }
}
