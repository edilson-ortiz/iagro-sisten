'use client';

import { useEffect, useRef, useState } from 'react';
import s from './chat.module.css';

/**
 * Imagen a pantalla completa (como WhatsApp): zoom con dos dedos, doble toque o la rueda del mouse,
 * arrastrar para moverla con zoom, y botón para descargarla.
 */
const MAX = 5;
const limitar = (v: number) => Math.min(MAX, Math.max(1, v));

export function VisorImagen({ url, descarga, fecha, alCerrar }: { url: string; descarga: string; fecha: string; alCerrar: () => void }) {
  const [t, setT] = useState({ s: 1, x: 0, y: 0 });
  const [cargada, setCargada] = useState(false);
  const area = useRef<HTMLDivElement>(null);
  const dedos = useRef(new Map<number, { x: number; y: number }>());
  const gesto = useRef<{ dist: number; s: number; x: number; y: number; cx: number; cy: number } | null>(null);
  const ultimoToque = useRef(0);
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') alCerrar(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [alCerrar]);

  /** Punto de la pantalla relativo al centro del área (el origen de la transformación) */
  const relativo = (cx: number, cy: number) => {
    const r = area.current!.getBoundingClientRect();
    return { px: cx - r.left - r.width / 2, py: cy - r.top - r.height / 2 };
  };

  /** Zoom manteniendo fijo el punto (cx, cy) bajo el dedo o el mouse */
  const zoomEn = (nueva: number, cx: number, cy: number, base = tRef.current) => {
    const s2 = limitar(nueva);
    if (s2 === 1) return { s: 1, x: 0, y: 0 };
    const { px, py } = relativo(cx, cy);
    return { s: s2, x: px - (px - base.x) * (s2 / base.s), y: py - (py - base.y) * (s2 / base.s) };
  };

  const alRueda = (e: React.WheelEvent) => setT(zoomEn(tRef.current.s * (e.deltaY < 0 ? 1.2 : 1 / 1.2), e.clientX, e.clientY));

  const alternarZoom = (cx: number, cy: number) => setT(tRef.current.s > 1 ? { s: 1, x: 0, y: 0 } : zoomEn(2.5, cx, cy));

  const alBajar = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = [...dedos.current.values()];
    if (p.length === 2) {
      const cx = (p[0].x + p[1].x) / 2, cy = (p[0].y + p[1].y) / 2;
      gesto.current = { dist: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), ...tRef.current, cx, cy };
    } else if (p.length === 1 && e.pointerType !== 'mouse') {
      // Doble toque en el celular (en la PC se usa doble clic)
      const ahora = Date.now();
      if (ahora - ultimoToque.current < 300) { alternarZoom(e.clientX, e.clientY); ultimoToque.current = 0; }
      else ultimoToque.current = ahora;
    }
  };

  const alMover = (e: React.PointerEvent) => {
    const previo = dedos.current.get(e.pointerId);
    if (!previo) return;
    dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = [...dedos.current.values()];
    if (p.length === 2 && gesto.current) {
      const g = gesto.current;
      const dist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      setT(zoomEn(g.s * (dist / g.dist), g.cx, g.cy, { s: g.s, x: g.x, y: g.y }));
    } else if (p.length === 1 && tRef.current.s > 1) {
      setT((v) => ({ ...v, x: v.x + e.clientX - previo.x, y: v.y + e.clientY - previo.y }));
    }
  };

  const alSoltar = (e: React.PointerEvent) => {
    dedos.current.delete(e.pointerId);
    if (dedos.current.size < 2) gesto.current = null;
  };

  return (
    <div className={s.visorImagen} role="dialog" aria-modal="true" aria-label="Imagen">
      <header className={s.visorImagenCabecera}>
        <button type="button" onClick={alCerrar} aria-label="Volver">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z" fill="currentColor" /></svg>
        </button>
        <div><strong>IAGRO Clima</strong><span>{fecha}</span></div>
        <a href={descarga} download aria-label="Descargar imagen" title="Descargar">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20h14v-2H5v2zm7-3 6-6-1.4-1.4-3.6 3.6V3h-2v10.2L7.4 9.6 6 11l6 6z" fill="currentColor" /></svg>
        </a>
      </header>
      <div
        ref={area}
        className={s.visorImagenArea}
        onWheel={alRueda}
        onDoubleClick={(e) => alternarZoom(e.clientX, e.clientY)}
        onPointerDown={alBajar}
        onPointerMove={alMover}
        onPointerUp={alSoltar}
        onPointerCancel={alSoltar}
      >
        {!cargada && <span className={s.visorImagenCargando}>Cargando…</span>}
        <img
          src={url}
          alt=""
          draggable={false}
          onLoad={() => setCargada(true)}
          style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})`, transition: dedos.current.size ? 'none' : 'transform 0.15s ease-out' }}
        />
      </div>
      <p className={s.visorImagenAyuda}>{t.s > 1 ? 'Arrastra para mover · doble toque para alejar' : 'Pellizca o toca dos veces para hacer zoom'}</p>
    </div>
  );
}
