import { NextResponse } from 'next/server';
import { tokenWaValido } from '@/lib/pronostico-wa';
import { ubicacionDeTexto } from '@/lib/ubicacion-enlace';

/**
 * Ubicación escrita o pegada en un mensaje de WhatsApp (flujo n8n "IAGRO · Bot WhatsApp").
 *   POST /panel/api/whatsapp/ubicacion  { texto }   (header x-token: wa_api_token)
 * → { lat, lon, enlace }  (lat/lon null si no hay; enlace = traía un enlace de mapa que no se pudo leer)
 */
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!(await tokenWaValido(req.headers.get('x-token')))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  let texto = '';
  try { texto = String(((await req.json()) as { texto?: unknown }).texto ?? '').slice(0, 4000); } catch { /* vacío */ }
  const r = await ubicacionDeTexto(texto);
  return NextResponse.json({ lat: r.ubicacion?.lat ?? null, lon: r.ubicacion?.lon ?? null, enlace: r.enlace });
}
