import { NextResponse } from 'next/server';
import { firmaValida } from '@/lib/chat-web';
import { borrarSuscripcion, clavesVapid, guardarSuscripcion, type Suscripcion } from '@/lib/chat-push';

/**
 * Notificaciones del chat web.
 *   GET    /chat/{tel}/push?k=firma               → clave pública VAPID (para suscribirse en el navegador)
 *   POST   /chat/{tel}/push  { k, suscripcion }   → guarda la suscripción de este navegador
 *   DELETE /chat/{tel}/push  { k, endpoint }      → la borra
 */
export const dynamic = 'force-dynamic';

const error = (mensaje: string, status: number) => NextResponse.json({ error: mensaje }, { status });

const esSuscripcion = (s: unknown): s is Suscripcion => {
  const x = s as Suscripcion | null;
  return !!x && typeof x.endpoint === 'string' && /^https:\/\//.test(x.endpoint) && x.endpoint.length < 1000
    && typeof x.keys?.p256dh === 'string' && typeof x.keys?.auth === 'string'
    && x.keys.p256dh.length < 200 && x.keys.auth.length < 100;
};

export async function GET(req: Request, { params }: { params: Promise<{ tel: string }> }) {
  const { tel } = await params;
  if (!firmaValida(tel, new URL(req.url).searchParams.get('k'))) return error('Enlace no válido.', 401);
  try {
    return NextResponse.json({ clave: (await clavesVapid()).publica });
  } catch (err) {
    console.error('[chat push] claves', (err as Error).message);
    return error('Las notificaciones no están disponibles.', 503);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ tel: string }> }) {
  const { tel } = await params;
  let cuerpo: { k?: string; suscripcion?: unknown };
  try { cuerpo = await req.json(); } catch { return error('Solicitud no válida.', 400); }
  if (!firmaValida(tel, cuerpo.k)) return error('Enlace no válido.', 401);
  if (!esSuscripcion(cuerpo.suscripcion)) return error('Suscripción no válida.', 400);
  try {
    await guardarSuscripcion(tel, cuerpo.suscripcion, req.headers.get('user-agent'));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[chat push] guardar', (err as Error).message);
    return error('No se pudo activar las notificaciones.', 500);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ tel: string }> }) {
  const { tel } = await params;
  let cuerpo: { k?: string; endpoint?: string };
  try { cuerpo = await req.json(); } catch { return error('Solicitud no válida.', 400); }
  if (!firmaValida(tel, cuerpo.k)) return error('Enlace no válido.', 401);
  if (typeof cuerpo.endpoint === 'string') await borrarSuscripcion(tel, cuerpo.endpoint).catch(() => {});
  return NextResponse.json({ ok: true });
}
