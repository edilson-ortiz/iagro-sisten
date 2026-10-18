/**
 * Lee coordenadas de lo que suele mandar un cliente o copiar el admin:
 *   "-17.7833, -63.1821" · "-17.7833 -63.1821"
 *   enlaces de Google Maps: ".../@-17.78,-63.18,15z" · "?q=-17.78,-63.18" · "ll=…" · "!3d-17.78!4d-63.18"
 * Los enlaces cortos (maps.app.goo.gl) no traen las coordenadas: hay que abrirlos y copiar las del navegador.
 */
export function leerCoordenadas(texto: string): { latitud: number; longitud: number } | null {
  const t = decodeURIComponent(texto.trim()).replace(/\s+/g, ' ');
  if (!t) return null;
  const n = String.raw`(-?\d{1,3}(?:\.\d+)?)`;
  const patrones = [
    new RegExp(String.raw`!3d${n}!4d${n}`),                     // datos internos del enlace (punto exacto del pin)
    new RegExp(String.raw`[?&](?:q|query|ll|destination)=${n},\s?${n}`),
    new RegExp(String.raw`@${n},${n}`),
    new RegExp(String.raw`^${n}\s*[,;\s]\s*${n}$`),             // "lat, lon" o "lat lon"
  ];
  for (const p of patrones) {
    const m = t.match(p);
    if (!m) continue;
    const latitud = Number(m[1]);
    const longitud = Number(m[2]);
    if (validas(latitud, longitud)) return { latitud: redondear(latitud), longitud: redondear(longitud) };
  }
  return null;
}

export const validas = (lat: number, lon: number) =>
  Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);

/** Bolivia aproximada: para advertir si se pegaron coordenadas de otro lugar (o invertidas) */
export const enBolivia = (lat: number, lon: number) => lat >= -23.2 && lat <= -9.5 && lon >= -69.8 && lon <= -57.3;

const redondear = (v: number) => Math.round(v * 1e6) / 1e6;
