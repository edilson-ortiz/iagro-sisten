import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { query, sql } from '@/lib/db';

/**
 * Pronóstico para el bot de WhatsApp (flujo n8n "IAGRO · Bot WhatsApp") y su imagen.
 * La API IAGRO atiende de a una consulta (con varias a la vez se cuelga): aquí van en fila,
 * y cada zona (~1 km) se guarda 30 min, así la imagen que pide Meta no vuelve a consultarla.
 * Los días se resumen igual que en el bot (nodo "Formatear Pronóstico + Radar").
 */

export type DiaPronostico = {
  fecha: string;          // dd/MM/yyyy
  nombre: string;         // Lunes
  corto: string;          // Lun
  ddmm: string;           // 02/11
  min: number | null;
  max: number | null;
  mm: number;             // lluvia total del día
  prob: number;           // probabilidad máxima de las horas con lluvia
  inicio: string | null;  // hora de la primera lluvia (HH:mm)
  viento: number;         // km/h promedio
  dir: string;            // dirección más frecuente
};

type Hora = { h?: string; td?: string | number; sr?: string | number; rp?: string | number; vsd?: string | number; vdId?: string };
type DiaApi = { fecha?: string; horarios?: Hora[] };

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DURACION = 30 * 60_000;
const DIAS_MAX = 8;

const num = (v: unknown) => { const n = parseFloat(String(v)); return Number.isFinite(n) ? n : NaN; };

function resumir(data: DiaApi[]): DiaPronostico[] {
  return data.filter((d) => /^\d{2}\/\d{2}\/\d{4}$/.test(d.fecha ?? '')).slice(0, DIAS_MAX).map((d) => {
    const horas = d.horarios ?? [];
    const temps = horas.map((h) => num(h.td)).filter((v) => !Number.isNaN(v));
    const vientos = horas.map((h) => num(h.vsd)).filter((v) => !Number.isNaN(v));
    const lluvia = horas.filter((h) => num(h.sr) > 0);
    const dirs = new Map<string, number>();
    for (const h of horas) if (h.vdId) dirs.set(h.vdId, (dirs.get(h.vdId) ?? 0) + 1);
    const [dia, mes, anio] = d.fecha!.split('/').map(Number);
    const semana = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
    return {
      fecha: d.fecha!,
      nombre: DIAS[semana],
      corto: CORTOS[semana],
      ddmm: d.fecha!.slice(0, 5),
      min: temps.length ? Math.round(Math.min(...temps)) : null,
      max: temps.length ? Math.round(Math.max(...temps)) : null,
      mm: Math.round(horas.reduce((s, h) => s + (num(h.sr) || 0), 0) * 10) / 10,
      prob: lluvia.length ? Math.round(Math.max(...lluvia.map((h) => num(h.rp) || 0))) : 0,
      inicio: lluvia[0]?.h ? String(lluvia[0].h).slice(0, 5) : null,
      viento: vientos.length ? Math.round(vientos.reduce((a, b) => a + b, 0) / vientos.length) : 0,
      dir: [...dirs.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '',
    };
  });
}

const cache = new Map<string, { dias: DiaPronostico[]; hasta: number }>();
const enCurso = new Map<string, Promise<DiaPronostico[]>>();
let fila: Promise<unknown> = Promise.resolve();

const claveZona = (lat: number, lon: number) => `${lat.toFixed(2)},${lon.toFixed(2)}`;

async function consultar(lat: number, lon: number) {
  const [c] = await query<{ url: string }>(sql`SELECT bot_clima.cfg_texto('lluvia_api_url', '') AS url`);
  const base = (c?.url ?? '').replace(/\/+$/, '');
  if (!base) throw new Error('Falta la URL de la API IAGRO (Configuración → Alerta de lluvia).');
  const r = await fetch(`${base}/forecast/hourly?lat=${lat}&lon=${lon}`, { cache: 'no-store', signal: AbortSignal.timeout(45_000) });
  if (!r.ok) throw new Error(`La API IAGRO respondió ${r.status}`);
  const j = (await r.json()) as { data?: DiaApi[] };
  const dias = resumir(j.data ?? []);
  if (!dias.length) throw new Error('La API IAGRO no devolvió días de pronóstico');
  return dias;
}

export async function pronosticoWa(lat: number, lon: number): Promise<DiaPronostico[]> {
  const k = claveZona(lat, lon);
  const guardado = cache.get(k);
  if (guardado && guardado.hasta > Date.now()) return guardado.dias;
  let p = enCurso.get(k);
  if (!p) {
    const tarea = fila.then(() => consultar(lat, lon));
    fila = tarea.catch(() => {});
    p = tarea
      .then((dias) => {
        if (cache.size > 2000) for (const [x, v] of cache) if (v.hasta < Date.now()) cache.delete(x);
        cache.set(k, { dias, hasta: Date.now() + DURACION });
        return dias;
      })
      .finally(() => enCurso.delete(k));
    enCurso.set(k, p);
  }
  return p;
}

// ---------- Firma de la imagen: solo se dibujan imágenes que el panel entregó al flujo ----------

function secreto() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET debe tener al menos 32 caracteres (ver .env.example).');
  return s;
}

export type ParamsImagen = { lat: string; lon: string; lugar: string; general: '0' | '1'; hora: string };

const textoFirma = (p: ParamsImagen) => [p.lat, p.lon, p.lugar, p.general, p.hora].join('|');
export const firmarImagen = (p: ParamsImagen) => createHmac('sha256', secreto()).update(`wa-img:${textoFirma(p)}`).digest('base64url').slice(0, 16);

export function firmaImagenValida(p: ParamsImagen, s: string | null) {
  if (!s) return false;
  const a = Buffer.from(firmarImagen(p));
  const b = Buffer.from(s);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Ruta de la imagen del pronóstico (la hora en la URL hace que WhatsApp no reutilice una vieja) */
export function rutaImagen(lat: number, lon: number, lugar: string, general: boolean) {
  const p: ParamsImagen = {
    lat: lat.toFixed(4), lon: lon.toFixed(4), lugar: lugar.slice(0, 40), general: general ? '1' : '0',
    hora: String(Math.floor(Date.now() / 3_600_000)),
  };
  const q = new URLSearchParams({ ...p, s: firmarImagen(p) });
  return `/panel/api/whatsapp/imagen?${q.toString()}`;
}

/** Token que manda n8n (Configuración → wa_api_token) */
export async function tokenWaValido(recibido: string | null) {
  if (!recibido) return false;
  const [r] = await query<{ token: string | null }>(sql`SELECT bot_clima.cfg_texto('wa_api_token', '') AS token`);
  const esperado = Buffer.from(r?.token ?? '');
  const dado = Buffer.from(recibido);
  return esperado.length > 0 && esperado.length === dado.length && timingSafeEqual(esperado, dado);
}
