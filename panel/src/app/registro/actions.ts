'use server';

import { randomInt } from 'node:crypto';
import { headers } from 'next/headers';
import { z } from 'zod';
import { query, registrarLog, sql } from '@/lib/db';

/**
 * Registro desde el sitio: guarda el campo elegido en el mapa en public.user_tmp y devuelve
 * un código de 7 caracteres. El cliente lo envía por WhatsApp como [IAGRO]:[código] y el bot
 * completa el registro buscando ese código (igual que cuando lo generaba n8n).
 */
const esquema = z.object({
  nombre: z.string().trim().min(2, 'Escribe el nombre de la propiedad.').max(150, 'El nombre es demasiado largo.'),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const nuevoCodigo = () => Array.from({ length: 7 }, () => LETRAS[randomInt(LETRAS.length)]).join('');

// Límite por IP para que no llenen user_tmp (6 registros cada 10 minutos)
const intentos = new Map<string, { n: number; desde: number }>();
const MAX = 6;
const VENTANA_MS = 10 * 60 * 1000;

export async function iniciarRegistro(entrada: z.input<typeof esquema>): Promise<{ codigo: string } | { error: string }> {
  const d = esquema.safeParse(entrada);
  if (!d.success) return { error: d.error.issues[0]?.message ?? 'Datos inválidos.' };
  if (d.data.lat === 0 && d.data.lng === 0) return { error: 'Elige la ubicación de tu campo en el mapa.' };

  const h = await headers();
  const ip = h.get('cf-connecting-ip') || h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'local';
  const ahora = Date.now();
  const reg = intentos.get(ip);
  if (reg && ahora - reg.desde < VENTANA_MS && reg.n >= MAX) {
    return { error: 'Demasiados intentos. Espera unos minutos y vuelve a intentar.' };
  }
  intentos.set(ip, reg && ahora - reg.desde < VENTANA_MS ? { n: reg.n + 1, desde: reg.desde } : { n: 1, desde: ahora });

  try {
    for (let intento = 0; intento < 5; intento++) {
      const [r] = await query<{ codigo: string }>(sql`
        INSERT INTO public.user_tmp (codigo, nombre, lat, lng)
        VALUES (${nuevoCodigo()}, ${d.data.nombre}, ${d.data.lat}, ${d.data.lng})
        ON CONFLICT (codigo) DO NOTHING
        RETURNING codigo`);
      if (r) {
        await registrarLog('info', 'web:registro', 'Registro iniciado desde el sitio', { codigo: r.codigo, nombre: d.data.nombre });
        return { codigo: r.codigo };
      }
    }
    throw new Error('No se pudo generar un código único');
  } catch (err) {
    console.error('[registro]', (err as Error).message);
    return { error: 'No se pudo completar el registro. Intenta de nuevo.' };
  }
}
