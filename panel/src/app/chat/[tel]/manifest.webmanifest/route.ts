import { NextResponse } from 'next/server';
import { firmaValida } from '@/lib/chat-web';

/**
 * Manifest de la app instalable (PWA). Es por cliente: la app abre su propio chat
 * (start_url con su teléfono y firma), porque el chat se identifica solo por el enlace.
 */
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ tel: string }> }) {
  const { tel } = await params;
  const k = new URL(req.url).searchParams.get('k');
  if (!firmaValida(tel, k)) return NextResponse.json({ error: 'Enlace no válido.' }, { status: 404 });

  return NextResponse.json({
    id: `/chat/${tel}`,
    name: 'IAGRO Clima',
    short_name: 'IAGRO',
    description: 'Pronóstico, radar y alertas de lluvia para tu campo.',
    lang: 'es',
    start_url: `/chat/${tel}?k=${encodeURIComponent(k!)}&app=1`,
    scope: '/chat/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#008069',
    theme_color: '#008069',
    icons: [
      { src: '/img/app-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/img/app-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/img/app-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }, { headers: { 'content-type': 'application/manifest+json; charset=utf-8', 'cache-control': 'no-store' } });
}
