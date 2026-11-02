/**
 * Ubicación escrita o pegada en un mensaje: enlaces de Google Maps (todos sus formatos, también los cortos
 * maps.app.goo.gl), Apple Maps, Waze, OpenStreetMap, geo:, coordenadas decimales y grados/minutos/segundos.
 * Lo usa el bot de WhatsApp (/panel/api/whatsapp/ubicacion).
 */

export type Coordenadas = { lat: number; lon: number };

const valida = (lat: number, lon: number) =>
  Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);

const par = (a?: string, b?: string): Coordenadas | null => {
  const lat = Number(a);
  const lon = Number(b);
  return a && b && valida(lat, lon) ? { lat, lon } : null;
};

function decodificar(texto: string) {
  let t = texto;
  // Los enlaces vienen con %2C, %20, %2F… a veces codificados dos veces
  for (let i = 0; i < 2; i++) {
    try { t = decodeURIComponent(t.replace(/\+/g, ' ')); } catch { break; }
  }
  return t;
}

const N = String.raw`(-?\d{1,3}(?:\.\d+)?)`;
const SEP = String.raw`\s*,\s*`;

// En orden de precisión: el pin exacto del lugar primero, el centro del mapa al final
const PATRONES: RegExp[] = [
  /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/,                                                 // Google: pin del lugar
  new RegExp(String.raw`[?&](?:q|query|ll|sll|daddr|saddr|destination|origin|center|coordinates|to|loc)=(?:loc:|ll\.)?\s*` + N + SEP + N, 'i'),
  /[?&]mlat=(-?\d{1,2}(?:\.\d+)?)[^\s]*?[?&]mlon=(-?\d{1,3}(?:\.\d+)?)/i,                    // OpenStreetMap
  /#map=\d{1,2}\/(-?\d{1,2}\.\d+)\/(-?\d{1,3}\.\d+)/,                                      // OpenStreetMap
  new RegExp(String.raw`/@` + N + ',' + N),                                                  // Google: centro del mapa
  new RegExp(String.raw`\bgeo:` + N + SEP + N, 'i'),                                         // geo:lat,lon
  /(?:^|[^\d.])(-?\d{1,2}\.\d{3,})\s*[,;\s]\s*(-?\d{1,3}\.\d{3,})(?![\d.])/,                // -17.7833, -63.1821
];

// 17°47'00.0"S 63°10'55.0"W  (Google comparte así) · también "O" de oeste
const DMS = /(\d{1,2})\s*°\s*(\d{1,2})\s*['′]\s*(\d{1,2}(?:[.,]\d+)?)?\s*(?:"|″|'')?\s*([NS])[\s,;]*(\d{1,3})\s*°\s*(\d{1,2})\s*['′]\s*(\d{1,2}(?:[.,]\d+)?)?\s*(?:"|″|'')?\s*([EWO])/i;

/** Geohash de Waze (waze.com/ul/h6t8…) → coordenadas */
function geohash(h: string): Coordenadas | null {
  const B32 = '0123456789bcdefghjkmnpqrstuvwxyz';
  let par1 = true;
  const lat = [-90, 90];
  const lon = [-180, 180];
  for (const c of h.toLowerCase()) {
    const v = B32.indexOf(c);
    if (v < 0) return null;
    for (let b = 4; b >= 0; b--) {
      const r = par1 ? lon : lat;
      const m = (r[0] + r[1]) / 2;
      if ((v >> b) & 1) r[0] = m; else r[1] = m;
      par1 = !par1;
    }
  }
  return par((lat[0] + lat[1]) / 2 + '', (lon[0] + lon[1]) / 2 + '');
}

/** Coordenadas que están escritas en el texto (sin abrir ningún enlace) */
export function coordenadasDeTexto(texto: string): Coordenadas | null {
  const t = decodificar(texto);
  for (const re of PATRONES) {
    const m = t.match(re);
    const c = m && par(m[1], m[2]);
    if (c) return c;
  }
  const d = t.match(DMS);
  if (d) {
    const g = (gr: string, mi: string, se = '0') => Number(gr) + Number(mi) / 60 + Number(se.replace(',', '.')) / 3600;
    const lat = g(d[1], d[2], d[3]) * (d[4].toUpperCase() === 'S' ? -1 : 1);
    const lon = g(d[5], d[6], d[7]) * (/[WO]/i.test(d[8]) ? -1 : 1);
    const c = par(String(lat), String(lon));
    if (c) return c;
  }
  const w = t.match(/waze\.com\/ul\/h([0-9a-z]{5,12})/i);
  return w ? geohash(w[1]) : null;
}

// Enlaces cortos o de "compartir" que hay que abrir para ver adónde llevan
const CORTO = /https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs|maps\.google\.[a-z.]+\/\?cid=|share\.google|maps\.apple(?:\.com)?\/p\/|waze\.com\/ul\/?\?|bit\.ly|tinyurl\.com)[^\s<>"]*/i;
const MAPA = /https?:\/\/[^\s<>"]*(?:google\.[a-z.]+\/maps|maps\.google|goo\.gl|maps\.apple|waze\.com|openstreetmap\.org|here\.com|bing\.com\/maps)[^\s<>"]*/i;

const resueltos = new Map<string, Coordenadas | null>();

/**
 * Ubicación del mensaje. Si es un enlace corto (maps.app.goo.gl…), sigue sus redirecciones hasta encontrar
 * las coordenadas (también en la página de consentimiento de Google, que trae el destino en ?continue=).
 * `enlace`: había un enlace de mapa aunque no se pudo leer la ubicación (para pedirla con 📎).
 */
export async function ubicacionDeTexto(texto: string): Promise<{ ubicacion: Coordenadas | null; enlace: boolean }> {
  const directa = coordenadasDeTexto(texto);
  if (directa) return { ubicacion: directa, enlace: false };
  const corto = texto.match(CORTO)?.[0];
  const enlace = !!(corto || MAPA.test(texto));
  if (!corto) return { ubicacion: null, enlace };
  if (resueltos.has(corto)) return { ubicacion: resueltos.get(corto)!, enlace: true };

  let url = corto;
  let hallada: Coordenadas | null = null;
  for (let salto = 0; salto < 8 && !hallada; salto++) {
    let r: Response;
    try {
      r = await fetch(url, {
        redirect: 'manual',
        headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36', 'accept-language': 'es' },
        signal: AbortSignal.timeout(8000),
      });
    } catch { break; }
    const destino = r.headers.get('location');
    if (destino) {
      hallada = coordenadasDeTexto(destino);
      url = new URL(destino, url).toString();
      continue;
    }
    // Sin redirección: las coordenadas pueden estar en la página (Google las pone en el mapa de vista previa)
    if (r.ok) hallada = coordenadasDeTexto((await r.text()).slice(0, 300_000));
    break;
  }
  if (resueltos.size > 1000) resueltos.clear();
  resueltos.set(corto, hallada);
  return { ubicacion: hallada, enlace: true };
}
