import { confChatWeb, firmaValida } from '@/lib/chat-web';

/**
 * Descarga de un adjunto del chat web: GET /chat/{tel}/archivo?k=firma&url=...
 * Pasa por el panel para que el navegador lo guarde como archivo (con un enlace directo a Chatwoot,
 * de otro dominio, solo lo abriría). Solo acepta archivos del mismo Chatwoot del chat.
 */
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ tel: string }> }) {
  const { tel } = await params;
  const q = new URL(req.url).searchParams;
  if (!firmaValida(tel, q.get('k'))) return new Response('Enlace no válido.', { status: 401 });
  const c = await confChatWeb();
  if ('error' in c) return new Response(c.error, { status: 503 });

  let destino: URL;
  try { destino = new URL(q.get('url') ?? ''); } catch { return new Response('Archivo no válido.', { status: 400 }); }
  if (destino.protocol !== 'https:' && destino.protocol !== 'http:') return new Response('Archivo no válido.', { status: 400 });
  if (destino.host !== new URL(c.base).host) return new Response('Archivo no permitido.', { status: 403 });

  try {
    const r = await fetch(destino, { redirect: 'follow', signal: AbortSignal.timeout(30_000), cache: 'no-store' });
    if (!r.ok || !r.body) return new Response('No se pudo descargar el archivo.', { status: 502 });
    const nombre = decodeURIComponent(destino.pathname.split('/').pop() || 'imagen').replace(/[^\w.\-]+/g, '_').slice(0, 80);
    return new Response(r.body, {
      headers: {
        'content-type': r.headers.get('content-type') ?? 'application/octet-stream',
        'content-disposition': `attachment; filename="iagro-${nombre}"`,
        'cache-control': 'private, max-age=3600',
      },
    });
  } catch (err) {
    console.error('[chat web] archivo', (err as Error).message);
    return new Response('No se pudo descargar el archivo.', { status: 502 });
  }
}
