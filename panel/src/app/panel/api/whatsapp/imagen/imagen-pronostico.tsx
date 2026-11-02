import type { DiaPronostico } from '@/lib/pronostico-wa';
import type { Mosaico } from '@/lib/mapa-satelital';

/**
 * Imagen del pronóstico de 7 días para el encabezado del mensaje de WhatsApp (next/og → PNG).
 * Satori solo entiende flexbox; la fuente incluida no tiene emojis: los íconos van en SVG.
 */

export const ANCHO = 900;
export const ALTO = 720;

const VERDE = '#1f7a4d';
const AZUL = '#1565c0';

function Icono({ d }: { d: DiaPronostico }) {
  const t = 56;
  if (d.mm >= 1) {
    return (
      <svg width={t} height={t} viewBox="0 0 64 64">
        <path d="M18 40h30a11 11 0 0 0 0-22 15 15 0 0 0-28-3 12 12 0 0 0-2 25z" fill="#90a4ae" />
        <path d="M22 46l-4 9M34 46l-4 9M46 46l-4 9" stroke="#1e88e5" strokeWidth="4" strokeLinecap="round" />
      </svg>
    );
  }
  if (d.mm > 0) {
    return (
      <svg width={t} height={t} viewBox="0 0 64 64">
        <circle cx="22" cy="22" r="11" fill="#fbc02d" />
        <path d="M24 44h24a10 10 0 0 0 0-20 13 13 0 0 0-24-2 11 11 0 0 0 0 22z" fill="#b0bec5" />
        <path d="M36 49l-3 7" stroke="#1e88e5" strokeWidth="4" strokeLinecap="round" />
      </svg>
    );
  }
  const calor = (d.max ?? 0) >= 38;
  const color = calor ? '#ef6c00' : '#fbc02d';
  return (
    <svg width={t} height={t} viewBox="0 0 64 64">
      <circle cx="32" cy="32" r="13" fill={color} />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((g) => {
        const r = (g * Math.PI) / 180;
        return <line key={g} x1={32 + Math.cos(r) * 19} y1={32 + Math.sin(r) * 19} x2={32 + Math.cos(r) * 27} y2={32 + Math.sin(r) * 27} stroke={color} strokeWidth="4" strokeLinecap="round" />;
      })}
    </svg>
  );
}

export const MAPA_ANCHO = 260;
export const MAPA_ALTO = 180;

/** Pin rojo con borde blanco y sombra; la punta queda justo en (x, y) */
function Pin({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <svg width="44" height="58" viewBox="0 0 44 58" style={{ position: 'absolute', left: x - 22, top: y - 56 }}>
      <ellipse cx="22" cy="55" rx="9" ry="3" fill="rgba(0,0,0,0.35)" />
      <path d="M22 54 C9 38 3 29 3 20 A19 19 0 0 1 41 20 C41 29 35 38 22 54Z" fill={color} stroke="#ffffff" strokeWidth="3.5" />
      <circle cx="22" cy="20" r="7" fill="#ffffff" />
    </svg>
  );
}

/**
 * Arriba a la izquierda: el lugar del pronóstico. Con mosaicos, mapa satelital real centrado en la ubicación
 * con su pin; sin mosaicos (no se pudieron bajar), un mapa dibujado.
 */
function Mapa({ general, mosaico }: { general: boolean; mosaico: Mosaico[] | null }) {
  const color = general ? '#7a8580' : '#e53935';
  if (mosaico) {
    return (
      <div style={{
        display: 'flex', position: 'relative', width: MAPA_ANCHO, height: MAPA_ALTO, overflow: 'hidden',
        borderRadius: 16, border: '3px solid #ffffff', boxShadow: '0 2px 8px rgba(0,0,0,0.25)', flexShrink: 0,
      }}>
        {mosaico.map((t) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={`${t.left},${t.top}`} src={t.src} width={256} height={256} style={{ position: 'absolute', left: t.left, top: t.top }} alt="" />
        ))}
        {!general && <div style={{ display: 'flex', position: 'absolute', left: MAPA_ANCHO / 2 - 34, top: MAPA_ALTO / 2 - 34, width: 68, height: 68, borderRadius: 34, border: '3px solid rgba(255,255,255,0.85)', background: 'rgba(229,57,53,0.18)' }} />}
        <Pin x={MAPA_ANCHO / 2} y={MAPA_ALTO / 2} color={color} />
        <div style={{
          display: 'flex', position: 'absolute', left: 8, bottom: 8, padding: '3px 10px', borderRadius: 12,
          background: 'rgba(255,255,255,0.92)', color: general ? '#5e6b65' : '#c62828', fontSize: 16,
        }}>
          {general ? 'Santa Cruz' : 'Tu ubicación'}
        </div>
        <div style={{ display: 'flex', position: 'absolute', right: 6, bottom: 4, fontSize: 10, color: 'rgba(255,255,255,0.85)' }}>Esri</div>
      </div>
    );
  }
  const pin = color;
  return (
    <svg width="150" height="130" viewBox="0 0 150 130">
      <rect width="150" height="130" rx="14" fill="#cfe3c4" />
      <path d="M0 82 C45 68 90 104 150 80" stroke="#9cc3e6" strokeWidth="7" fill="none" />
      <path d="M32 0 L84 130" stroke="#ffffff" strokeWidth="5" />
      <path d="M0 46 L150 56" stroke="#ffffff" strokeWidth="4" />
      <circle cx="75" cy="65" r="34" fill={general ? 'rgba(120,120,120,0.18)' : 'rgba(229,57,53,0.18)'} />
      <path d="M75 86 C61 68 61 50 75 50 C89 50 89 68 75 86Z" fill={pin} stroke="#ffffff" strokeWidth="3" />
      <circle cx="75" cy="61" r="5" fill="#ffffff" />
    </svg>
  );
}

export function ImagenPronostico({ dias, lugar, general, lat, lon, mosaico = null }: {
  dias: DiaPronostico[]; lugar: string; general: boolean; lat: number; lon: number; mosaico?: Mosaico[] | null;
}) {
  const semana = dias.slice(0, 7);
  const proxima = dias.find((d) => d.mm >= 1);
  const lluvia = proxima
    ? `Lluvia estimada: ${proxima.nombre.toLowerCase()} ${proxima.ddmm}${proxima.inicio ? ` desde las ${proxima.inicio}` : ''} · ~${Math.round(proxima.mm)} mm${proxima.prob ? ` (${proxima.prob}%)` : ''}`
    : 'Sin lluvias importantes en los próximos días';
  const actualizado = new Date().toLocaleString('es-BO', {
    timeZone: 'America/La_Paz', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });

  return (
    <div style={{ width: ANCHO, height: ALTO, display: 'flex', flexDirection: 'column', background: '#f4f8f5', padding: 28, color: '#1d2622' }}>
      {/* Encabezado: dónde es el pronóstico */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <Mapa general={general} mosaico={mosaico} />
        <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 24, flex: 1 }}>
          <div style={{ display: 'flex', fontSize: 38, color: '#1d2622' }}>{lugar}</div>
          <div style={{ display: 'flex', fontSize: 20, color: '#5e6b65', marginTop: 2 }}>
            {general ? 'Santa Cruz (general)' : `${lat.toFixed(4)}, ${lon.toFixed(4)}`}
          </div>
          <div style={{ display: 'flex', fontSize: 22, color: proxima ? AZUL : '#2e7d32', marginTop: 10 }}>{lluvia}</div>
          <div style={{ display: 'flex', marginTop: 12 }}>
            <div style={{
              display: 'flex', fontSize: 18, padding: '5px 16px', borderRadius: 20,
              background: general ? '#fff3e0' : '#e7f4ec', color: general ? '#b54708' : VERDE,
            }}>
              {general ? 'Ubicación general · envía la tuya' : 'Según tu ubicación'}
            </div>
          </div>
        </div>
      </div>

      {/* 7 días */}
      <div style={{ display: 'flex', flex: 1, marginTop: 26 }}>
        {semana.map((d, i) => {
          const llueve = d.mm >= 1;
          return (
            <div key={d.fecha} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', flex: 1,
              marginLeft: i ? 10 : 0, padding: '16px 4px', borderRadius: 16,
              background: llueve ? '#e3f0ff' : '#ffffff', border: `2px solid ${llueve ? '#90c2ff' : '#e3e8e5'}`,
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ display: 'flex', fontSize: 26, color: '#1d2622' }}>{i === 0 ? 'Hoy' : d.corto}</div>
                <div style={{ display: 'flex', fontSize: 17, color: '#6b7771' }}>{d.ddmm}</div>
              </div>
              <Icono d={d} />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ display: 'flex', fontSize: 30, color: (d.max ?? 0) >= 38 ? '#c0392b' : '#1d2622' }}>{d.max ?? '–'}°</div>
                <div style={{ display: 'flex', fontSize: 22, color: '#6b7771' }}>{d.min ?? '–'}°</div>
              </div>
              <div style={{ display: 'flex', fontSize: 22, color: d.mm > 0 ? AZUL : '#b5bfba' }}>
                {d.mm >= 1 ? Math.round(d.mm) : d.mm > 0 ? d.mm.toFixed(1) : 0} mm
              </div>
              <div style={{ display: 'flex', fontSize: 17, color: '#6b7771' }}>{d.viento} km/h</div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, fontSize: 17, color: '#8a958f' }}>
        <div style={{ display: 'flex', color: VERDE }}>IAGRO 360 · Pronóstico de 7 días</div>
        <div style={{ display: 'flex' }}>Actualizado {actualizado} · lluvia en mm · viento en km/h</div>
      </div>
    </div>
  );
}
