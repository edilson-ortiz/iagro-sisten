import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignJWT, jwtVerify } from 'jose';
import { cache } from 'react';

const COOKIE = 'iagro_sesion';
const DURACION_HORAS = 12;

export type Sesion = { adminId: number; usuario: string; nombre: string };

function secreto() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error('SESSION_SECRET debe tener al menos 32 caracteres (ver .env.example).');
  }
  return new TextEncoder().encode(s);
}

export async function crearSesion(s: Sesion) {
  const token = await new SignJWT({ usuario: s.usuario, nombre: s.nombre })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(s.adminId))
    .setIssuedAt()
    .setExpirationTime(`${DURACION_HORAS}h`)
    .sign(secreto());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' && process.env.COOKIE_INSEGURA !== '1',
    path: '/',
    maxAge: DURACION_HORAS * 3600,
  });
}

export async function cerrarSesion() {
  (await cookies()).delete(COOKIE);
}

/** Sesión actual o null. Se valida la firma en cada solicitud. */
export const obtenerSesion = cache(async (): Promise<Sesion | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secreto(), { algorithms: ['HS256'] });
    return { adminId: Number(payload.sub), usuario: String(payload.usuario), nombre: String(payload.nombre) };
  } catch {
    return null;
  }
});

/** Para páginas y acciones del panel: sin sesión válida → al login. */
export async function requerirSesion(): Promise<Sesion> {
  const s = await obtenerSesion();
  if (!s) redirect('/panel/login');
  return s;
}
