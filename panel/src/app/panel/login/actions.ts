'use server';

import { headers } from 'next/headers';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { crearSesion, cerrarSesion } from '@/lib/auth';
import { query, registrarLog, sql } from '@/lib/db';

// Límite simple de intentos por IP (suficiente para un panel con pocos administradores)
const intentos = new Map<string, { n: number; desde: number }>();
const MAX_INTENTOS = 5;
const VENTANA_MS = 10 * 60 * 1000;

const esquema = z.object({
  usuario: z.string().trim().min(1, 'Ingresa tu usuario').max(50),
  password: z.string().min(1, 'Ingresa tu contraseña').max(200),
});

let HASH_FALSO: string | undefined;

export type EstadoLogin = { error?: string; ok?: boolean };

export async function iniciarSesion(_prev: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'local';
  const ahora = Date.now();
  const reg = intentos.get(ip);
  if (reg && ahora - reg.desde < VENTANA_MS && reg.n >= MAX_INTENTOS) {
    return { error: 'Demasiados intentos. Espera unos minutos y vuelve a intentar.' };
  }

  const datos = esquema.safeParse({ usuario: form.get('usuario'), password: form.get('password') });
  if (!datos.success) return { error: datos.error.issues[0]?.message ?? 'Datos inválidos' };

  let admin: { id: number; usuario: string; nombre: string; password_hash: string } | undefined;
  try {
    [admin] = await query(sql`
      SELECT id, usuario, nombre, password_hash FROM bot_clima.administradores
      WHERE usuario = ${datos.data.usuario.toLowerCase()} AND activo`);
  } catch (err) {
    console.error('[login]', err);
    return { error: 'No se pudo conectar a la base de datos. Revisa DATABASE_URL.' };
  }

  // Se compara siempre (aunque el usuario no exista) para no revelar qué usuarios existen
  const hash = admin?.password_hash ?? (HASH_FALSO ??= await bcrypt.hash('sin-usuario', 12));
  const valido = await bcrypt.compare(datos.data.password, hash);

  if (!admin || !valido) {
    intentos.set(ip, reg && ahora - reg.desde < VENTANA_MS ? { n: reg.n + 1, desde: reg.desde } : { n: 1, desde: ahora });
    await registrarLog('aviso', 'panel:login', 'Intento de acceso fallido', { usuario: datos.data.usuario, ip });
    return { error: 'Usuario o contraseña incorrectos.' };
  }

  intentos.delete(ip);
  await query(sql`UPDATE bot_clima.administradores SET ultimo_acceso = now() WHERE id = ${admin.id}`);
  await crearSesion({ adminId: admin.id, usuario: admin.usuario, nombre: admin.nombre });
  // La navegación la hace el navegador (router): un redirect() desde una acción pierde el basePath /panel
  return { ok: true };
}

export async function salir() {
  await cerrarSesion();
}
