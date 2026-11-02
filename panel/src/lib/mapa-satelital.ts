import 'server-only';

/**
 * Recorte de mapa satelital (mosaicos de Esri World Imagery, gratis con atribución) centrado en un punto,
 * para la imagen del pronóstico del bot de WhatsApp. Los mosaicos se guardan en memoria: las zonas se repiten.
 */

export type Mosaico = { src: string; left: number; top: number };

const mosaicos = new Map<string, Promise<string | null>>();

function bajar(z: number, x: number, y: number) {
  const clave = `${z}/${x}/${y}`;
  let p = mosaicos.get(clave);
  if (!p) {
    p = fetch(`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`, {
      headers: { 'user-agent': 'IAGRO-360/1.0 (iagro360.xyz)' }, signal: AbortSignal.timeout(6000),
    })
      .then(async (r) => (r.ok ? `data:${r.headers.get('content-type') ?? 'image/jpeg'};base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}` : null))
      .catch(() => null)
      .then((src) => { if (!src) mosaicos.delete(clave); return src; });   // si falló, se reintenta la próxima vez
    if (mosaicos.size > 600) mosaicos.delete(mosaicos.keys().next().value!);
    mosaicos.set(clave, p);
  }
  return p;
}

/** Mosaicos que cubren un recuadro de ancho × alto con (lat, lon) en el centro; null si alguno no se pudo bajar */
export async function recorteSatelital(lat: number, lon: number, zoom: number, ancho: number, alto: number): Promise<Mosaico[] | null> {
  const total = 256 * 2 ** zoom;
  const r = (lat * Math.PI) / 180;
  const px = ((lon + 180) / 360) * total;
  const py = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * total;
  const x0 = px - ancho / 2;
  const y0 = py - alto / 2;
  const lista: { x: number; y: number }[] = [];
  for (let x = Math.floor(x0 / 256); x <= Math.floor((x0 + ancho) / 256); x++) {
    for (let y = Math.floor(y0 / 256); y <= Math.floor((y0 + alto) / 256); y++) lista.push({ x, y });
  }
  const srcs = await Promise.all(lista.map((t) => bajar(zoom, t.x, t.y)));
  if (srcs.some((s) => !s)) return null;
  return lista.map((t, i) => ({ src: srcs[i]!, left: Math.round(t.x * 256 - x0), top: Math.round(t.y * 256 - y0) }));
}
