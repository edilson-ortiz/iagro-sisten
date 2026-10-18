import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const ZONA_HORARIA = 'America/La_Paz';

/** "8 oct 2026" */
export function fmtFecha(v: string | Date | null | undefined): string {
  if (!v) return '—';
  const d = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00`) : new Date(v);
  return d.toLocaleDateString('es-BO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: ZONA_HORARIA });
}

/** "8 oct 2026, 14:30" */
export function fmtFechaHora(v: string | Date | null | undefined): string {
  if (!v) return '—';
  return new Date(v).toLocaleString('es-BO', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: ZONA_HORARIA,
  });
}

/** "hace 3 días", "en 5 días" */
export function fmtRelativo(v: string | Date | null | undefined): string {
  if (!v) return '—';
  const diff = (new Date(v).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}

export function fmtMonto(monto: number | string, moneda = 'BOB'): string {
  const n = Number(monto);
  const simbolo = moneda === 'BOB' ? 'Bs' : moneda === 'USD' ? '$' : moneda;
  return `${simbolo} ${n.toLocaleString('es-BO', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

/** 59176098116 → +591 76098116 */
export function fmtTelefono(t: string): string {
  const d = t.replace(/\D/g, '');
  if (d.startsWith('591') && d.length === 11) return `+591 ${d.slice(3)}`;
  return `+${d}`;
}

export function iniciales(nombre: string | null | undefined): string {
  return (nombre || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
}

/** Pronóstico visual de Ventusky centrado en las coordenadas del usuario */
export function urlVentusky(lat: number | null | undefined, lon: number | null | undefined): string | null {
  if (lat == null || lon == null) return null;
  return `https://www.ventusky.com/es/${Number(lat).toFixed(3)};${Number(lon).toFixed(3)}`;
}

/** Página de radar IAGRO del usuario (id de bot_clima.usuarios) */
export function urlRadar(id: number): string {
  return `/radar/${id}`; // el sitio público es parte de esta misma app
}
