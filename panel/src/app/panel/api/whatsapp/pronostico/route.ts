import { NextResponse } from 'next/server';
import { pronosticoWa, rutaImagen, tokenWaValido } from '@/lib/pronostico-wa';

/**
 * Pronóstico para el bot de WhatsApp (flujo n8n "IAGRO · Bot WhatsApp").
 *   GET /panel/api/whatsapp/pronostico?lat=&lon=&lugar=&general=0|1   (header x-token: wa_api_token)
 * Devuelve los días resumidos y la ruta de la imagen (firmada) para el encabezado del mensaje.
 */
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!(await tokenWaValido(req.headers.get('x-token')))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const q = new URL(req.url).searchParams;
  const lat = Number(q.get('lat'));
  const lon = Number(q.get('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ error: 'Coordenadas inválidas' }, { status: 400 });
  }
  const lugar = (q.get('lugar') ?? '').replace(/\s+/g, ' ').trim().slice(0, 40) || 'Tu ubicación';
  const general = q.get('general') === '1';
  try {
    const dias = await pronosticoWa(lat, lon);
    return NextResponse.json({ dias, imagen: rutaImagen(lat, lon, lugar, general) });
  } catch (err) {
    console.error('[whatsapp] pronóstico', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
