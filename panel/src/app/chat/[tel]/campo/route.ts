import { NextResponse } from 'next/server';
import { query, sql } from '@/lib/db';
import { firmaValida } from '@/lib/chat-web';

/** GET /chat/{tel}/campo?k=firma: la ubicación registrada del cliente (al día, por si la cambió por el chat) */
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ tel: string }> }) {
  const { tel } = await params;
  if (!firmaValida(tel, new URL(req.url).searchParams.get('k'))) {
    return NextResponse.json({ error: 'Enlace no válido.' }, { status: 401 });
  }
  const [c] = await query<{ id: number; nombre: string | null; lat: number | null; lon: number | null; zona: string | null }>(sql`
    SELECT id, nombre, latitud AS lat, longitud AS lon, zona FROM bot_clima.usuarios WHERE telefono = ${tel} LIMIT 1`);
  return NextResponse.json({ campo: c ?? null });
}
