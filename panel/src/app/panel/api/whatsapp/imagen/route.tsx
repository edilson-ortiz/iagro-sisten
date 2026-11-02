import { ImageResponse } from 'next/og';
import { firmaImagenValida, pronosticoWa, type ParamsImagen } from '@/lib/pronostico-wa';
import { recorteSatelital } from '@/lib/mapa-satelital';
import { ALTO, ANCHO, ImagenPronostico, MAPA_ALTO, MAPA_ANCHO } from './imagen-pronostico';

/**
 * Imagen del pronóstico (PNG) para el encabezado del mensaje del bot de WhatsApp.
 * La URL la arma /panel/api/whatsapp/pronostico (firmada): Meta la descarga al enviar el mensaje.
 * Usa el pronóstico guardado de esa zona, así no vuelve a consultar la API IAGRO.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const p: ParamsImagen = {
    lat: q.get('lat') ?? '', lon: q.get('lon') ?? '', lugar: q.get('lugar') ?? '',
    general: q.get('general') === '1' ? '1' : '0', hora: q.get('hora') ?? '',
  };
  if (!firmaImagenValida(p, q.get('s'))) return new Response('Imagen no válida', { status: 403 });
  const lat = Number(p.lat);
  const lon = Number(p.lon);
  try {
    const general = p.general === '1';
    // Mapa satelital real del lugar (zona de la ciudad si es el pronóstico general); si falla, mapa dibujado
    const [dias, mosaico] = await Promise.all([
      pronosticoWa(lat, lon),
      recorteSatelital(lat, lon, general ? 11 : 15, MAPA_ANCHO, MAPA_ALTO).catch(() => null),
    ]);
    return new ImageResponse(
      <ImagenPronostico dias={dias} lugar={p.lugar || 'Tu ubicación'} general={general} lat={lat} lon={lon} mosaico={mosaico} />,
      { width: ANCHO, height: ALTO, headers: { 'cache-control': 'public, max-age=1800' } },
    );
  } catch (err) {
    console.error('[whatsapp] imagen', (err as Error).message);
    return new Response('Pronóstico no disponible', { status: 502 });
  }
}
