'use client';

import type { AppWeb } from './app-web';
import s from './chat.module.css';

/** Perfil de empresa de IAGRO (como la "Info. del contacto" de WhatsApp) */
export function Perfil({ telefono, app, radarId, sinVer, alCerrar, alVerEstados, alInstalar }: {
  telefono: string; app: AppWeb; radarId: number | null; sinVer: number;
  alCerrar: () => void; alVerEstados: () => void; alInstalar: () => void;
}) {
  const avisos = {
    granted: { texto: 'Activadas', accion: null },
    default: { texto: 'Desactivadas · toca para activar', accion: () => app.activarNotificaciones() },
    denied: { texto: 'Bloqueadas en el navegador (candado 🔒 junto a la dirección → Notificaciones → Permitir)', accion: null },
    'instalar-primero': { texto: 'Primero instala la app en tu iPhone', accion: alInstalar },
    'no-soportado': { texto: 'Este navegador no permite notificaciones', accion: null },
  }[app.permiso];

  return (
    <div className={s.perfil} role="dialog" aria-modal="true" aria-label="Información de IAGRO">
      <header className={s.perfilCabecera}>
        <button type="button" onClick={alCerrar} aria-label="Volver">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z" fill="currentColor" /></svg>
        </button>
        <span>Info. de la empresa</span>
      </header>

      <div className={s.perfilScroll}>
        <section className={s.perfilTarjeta}>
          <button type="button" className={`${s.anillo} ${s.anilloGrande} ${sinVer ? s.anilloNuevo : ''}`} onClick={alVerEstados} aria-label="Ver estados">
            <img src="/img/app-192.png" alt="" width={120} height={120} />
          </button>
          <h2>IAGRO Clima <span className={s.verificado} title="Cuenta de empresa">✓</span></h2>
          <p>Cuenta de empresa</p>
          <div className={s.perfilAcciones}>
            <button type="button" onClick={alVerEstados}><span>◎</span>Estados</button>
            {radarId && <a href={`/radar/${radarId}`} target="_blank" rel="noopener noreferrer"><span>🌧️</span>Mi radar</a>}
            <a href="https://iagro360.xyz" target="_blank" rel="noopener noreferrer"><span>🌐</span>Sitio web</a>
          </div>
        </section>

        <section className={s.perfilTarjeta}>
          <p className={s.perfilInfo}>
            🌱 Tu asistente del clima para el campo: pronóstico de 7 días, radar de lluvia en vivo, alertas antes de que llueva,
            registro de lluvias y el mejor momento para fumigar.
          </p>
          <dl className={s.perfilDatos}>
            <div><dt>🕒</dt><dd>Atención automática las 24 horas</dd></div>
            <div><dt>📍</dt><dd>Santa Cruz de la Sierra, Bolivia</dd></div>
            <div><dt>🌐</dt><dd><a href="https://iagro360.xyz" target="_blank" rel="noopener noreferrer">iagro360.xyz</a></dd></div>
          </dl>
        </section>

        <section className={s.perfilTarjeta}>
          <button type="button" className={s.perfilFila} onClick={avisos.accion ?? undefined} disabled={!avisos.accion}>
            <span className={s.perfilIcono}>🔔</span>
            <span><strong>Notificaciones</strong><small>{avisos.texto}</small></span>
          </button>
          {!app.instalada && (
            <button type="button" className={s.perfilFila} onClick={alInstalar}>
              <span className={s.perfilIcono}>📲</span>
              <span><strong>Instalar la app</strong><small>Entra a IAGRO desde la pantalla de inicio, como una app</small></span>
            </button>
          )}
          <div className={s.perfilFila}>
            <span className={s.perfilIcono}>🔒</span>
            <span><strong>Tu número</strong><small>+{telefono} · este chat es solo tuyo</small></span>
          </div>
        </section>
      </div>
    </div>
  );
}
