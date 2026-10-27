import { NextResponse } from 'next/server';
import { confChatWeb, enviarChat, firmaValida, mensajesChat } from '@/lib/chat-web';

/**
 * Mensajes del chat web.
 *   GET  /chat/{tel}/mensajes?k=firma[&antes=id]  → últimos mensajes (o los anteriores a `antes`)
 *   POST /chat/{tel}/mensajes  { k, texto }        → envía un mensaje del cliente
 */
export const dynamic = 'force-dynamic';

const MAX_TEXTO = 4000;

const error = (mensaje: string, status: number) => NextResponse.json({ error: mensaje }, { status });

async function preparar(tel: string, k: string | null | undefined) {
  if (!firmaValida(tel, k)) return { res: error('Enlace no válido.', 401) };
  const c = await confChatWeb();
  if ('error' in c) return { res: error(c.error, 503) };
  return { c };
}

export async function GET(req: Request, { params }: { params: Promise<{ tel: string }> }) {
  const { tel } = await params;
  const url = new URL(req.url);
  const p = await preparar(tel, url.searchParams.get('k'));
  if (!p.c) return p.res;
  const antes = Number(url.searchParams.get('antes')) || undefined;
  try {
    return NextResponse.json(await mensajesChat(p.c, tel, antes));
  } catch (err) {
    console.error('[chat web] leer', (err as Error).message);
    return error('No se pudo conectar con el chat. Reintentando…', 502);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ tel: string }> }) {
  const { tel } = await params;
  let cuerpo: { k?: string; texto?: string };
  try { cuerpo = await req.json(); } catch { return error('Solicitud no válida.', 400); }
  const p = await preparar(tel, cuerpo.k);
  if (!p.c) return p.res;
  const texto = (cuerpo.texto ?? '').trim();
  if (!texto) return error('El mensaje está vacío.', 400);
  if (texto.length > MAX_TEXTO) return error(`El mensaje es muy largo (máximo ${MAX_TEXTO} caracteres).`, 400);
  try {
    return NextResponse.json({ mensaje: await enviarChat(p.c, tel, texto) });
  } catch (err) {
    console.error('[chat web] enviar', (err as Error).message);
    return error('No se pudo enviar. Revisa tu conexión e inténtalo de nuevo.', 502);
  }
}
