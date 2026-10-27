'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { guardado } from './app-web';
import s from './chat.module.css';

/**
 * Estados de IAGRO (como los de WhatsApp): el radar de lluvia del día y tarjetas fijas.
 * Se ven al tocar la foto de IAGRO; el anillo verde indica que hay estados sin ver.
 */

export type Accion = { tipo: 'enviar'; texto: string } | { tipo: 'escribir'; texto: string } | { tipo: 'enlace'; url: string } | { tipo: 'notificaciones' };

export type Estado = {
  id: string;
  duracion: number;
  pie: string;
  boton?: { texto: string; accion: Accion };
} & ({ tipo: 'radar'; mapa: string } | { tipo: 'texto'; fondo: string; titulo: string; texto: string });

const SANTA_CRUZ = { lat: -17.786, lon: -63.181 };
const CLAVE_VISTOS = 'iagro-estados-vistos';

export function crearEstados(o: {
  hoy: string; radarId: number | null; lat: number | null; lon: number | null; nombre: string | null; notificacionesActivas: boolean;
}): Estado[] {
  const conCampo = o.lat != null && o.lon != null;
  const lat = conCampo ? o.lat! : SANTA_CRUZ.lat;
  const lon = conCampo ? o.lon! : SANTA_CRUZ.lon;
  const pin = conCampo ? `&pin=${lat};${lon};dot;${encodeURIComponent(o.nombre?.trim() || 'Mi campo')}` : '';
  const estados: Estado[] = [
    {
      // El id cambia cada día: el radar vuelve a aparecer como nuevo
      id: `radar-${o.hoy}`,
      tipo: 'radar',
      duracion: 15_000,
      mapa: `https://embed.ventusky.com/?p=${lat};${lon};${conCampo ? 7 : 5}&l=rain-3h&w=soft${pin}`,
      pie: conCampo ? '🌧️ Radar de lluvia en vivo sobre tu campo' : '🌧️ Radar de lluvia en vivo · Santa Cruz',
      boton: o.radarId ? { texto: 'Abrir mi radar', accion: { tipo: 'enlace', url: `/radar/${o.radarId}` } } : undefined,
    },
    {
      id: 'pronostico-1',
      tipo: 'texto',
      duracion: 6_000,
      fondo: 'linear-gradient(160deg, #00a884, #0b6e5f)',
      titulo: '🌦️ Pronóstico de 7 días',
      texto: 'Lluvia, temperatura, viento y el mejor momento para fumigar en tu campo.',
      pie: 'Pronóstico IAGRO',
      boton: { texto: '🌦️ Ver pronóstico', accion: { tipo: 'enviar', texto: '🌦️ Ver pronóstico' } },
    },
    {
      id: 'lluvias-1',
      tipo: 'texto',
      duracion: 6_000,
      fondo: 'linear-gradient(160deg, #2b7bd6, #173f86)',
      titulo: '🌧️ ¿Llovió en tu campo?',
      texto: 'Anota tus lluvias escribiendo, por ejemplo:\n«llovió 15 mm»',
      pie: 'Registro de lluvias',
      boton: { texto: '✍️ Anotar lluvia', accion: { tipo: 'escribir', texto: 'llovió  mm' } },
    },
  ];
  if (!o.notificacionesActivas) {
    estados.push({
      id: 'avisos-1',
      tipo: 'texto',
      duracion: 6_000,
      fondo: 'linear-gradient(160deg, #e2902a, #b4521c)',
      titulo: '🔔 Alertas de lluvia',
      texto: 'Te avisamos antes de que llueva en tu campo. Activa las notificaciones para no perderte ninguna.',
      pie: 'Notificaciones',
      boton: { texto: 'Activar notificaciones', accion: { tipo: 'notificaciones' } },
    });
  }
  return estados;
}

export function useEstadosVistos(estados: Estado[]) {
  const [vistos, setVistos] = useState<string[]>([]);
  useEffect(() => {
    try { setVistos(JSON.parse(guardado.leer(CLAVE_VISTOS) ?? '[]')); } catch { setVistos([]); }
  }, []);
  const marcar = useCallback((id: string) => {
    setVistos((v) => {
      if (v.includes(id)) return v;
      const nuevos = [...v, id].slice(-50);
      guardado.escribir(CLAVE_VISTOS, JSON.stringify(nuevos));
      return nuevos;
    });
  }, []);
  const sinVer = estados.filter((e) => !vistos.includes(e.id)).length;
  // Abre en el primero sin ver (como WhatsApp)
  const primero = Math.max(0, estados.findIndex((e) => !vistos.includes(e.id)));
  return { sinVer, primero, marcar };
}

export function VisorEstados({ estados, inicio, alVer, alCerrar, alAccion }: {
  estados: Estado[]; inicio: number; alVer: (id: string) => void; alCerrar: () => void; alAccion: (a: Accion) => void;
}) {
  const [i, setI] = useState(inicio);
  const [avance, setAvance] = useState(0);
  const pausa = useRef(false);
  const progreso = useRef(0);
  const iRef = useRef(i);
  iRef.current = i;
  const actual = estados[i];

  const siguiente = useCallback(() => {
    progreso.current = 0;
    setAvance(0);
    if (iRef.current + 1 >= estados.length) alCerrar();
    else setI(iRef.current + 1);
  }, [estados.length, alCerrar]);
  const anterior = () => { progreso.current = 0; setAvance(0); setI(Math.max(0, iRef.current - 1)); };

  useEffect(() => { if (actual) alVer(actual.id); }, [actual, alVer]);

  // Barra de progreso: avanza sola y se detiene mientras se mantiene presionado
  useEffect(() => {
    if (!actual) return;
    progreso.current = 0;
    let previo = performance.now();
    let id = 0;
    const paso = (t: number) => {
      const dt = t - previo;
      previo = t;
      if (!pausa.current) {
        progreso.current += dt / actual.duracion;
        if (progreso.current >= 1) { siguiente(); return; }
        setAvance(progreso.current);
      }
      id = requestAnimationFrame(paso);
    };
    id = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(id);
  }, [actual, siguiente]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') alCerrar();
      if (e.key === 'ArrowRight') siguiente();
      if (e.key === 'ArrowLeft') anterior();
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [alCerrar, siguiente]);

  if (!actual) return null;
  const presionar = { onPointerDown: () => { pausa.current = true; }, onPointerUp: () => { pausa.current = false; }, onPointerLeave: () => { pausa.current = false; } };

  return (
    <div className={s.visor} role="dialog" aria-modal="true" aria-label="Estados de IAGRO">
      <div className={s.visorBarras}>
        {estados.map((e, n) => (
          <span key={e.id}><i style={{ width: `${n < i ? 100 : n === i ? avance * 100 : 0}%` }} /></span>
        ))}
      </div>
      <div className={s.visorCabecera}>
        <img src="/img/app-96.png" alt="" width={36} height={36} />
        <div><strong>IAGRO Clima</strong><span>{actual.pie}</span></div>
        <button type="button" onClick={alCerrar} aria-label="Cerrar">✕</button>
      </div>

      <div className={s.visorCuerpo}>
        {actual.tipo === 'radar' ? (
          <>
            <div className={s.visorCargando}>🌧️ Cargando radar…</div>
            <iframe className={s.visorMapa} src={actual.mapa} title="Radar de lluvia" sandbox="allow-scripts allow-same-origin" />
          </>
        ) : (
          <div className={s.visorTexto} style={{ background: actual.fondo }} {...presionar}>
            <h2>{actual.titulo}</h2>
            <p>{actual.texto}</p>
          </div>
        )}
        {/* Zonas para pasar de estado (en el radar solo los bordes, para poder mover el mapa) */}
        <button type="button" className={`${s.zona} ${s.zonaIzq} ${actual.tipo === 'radar' ? s.zonaAngosta : ''}`} onClick={anterior} aria-label="Anterior" {...presionar} />
        <button type="button" className={`${s.zona} ${s.zonaDer} ${actual.tipo === 'radar' ? s.zonaAngosta : ''}`} onClick={siguiente} aria-label="Siguiente" {...presionar} />
      </div>

      {actual.boton && (
        <div className={s.visorPie}>
          <button type="button" onClick={() => { alCerrar(); alAccion(actual.boton!.accion); }}>{actual.boton.texto}</button>
        </div>
      )}
    </div>
  );
}
