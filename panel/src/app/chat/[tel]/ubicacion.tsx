'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import 'leaflet/dist/leaflet.css';
import s from './chat.module.css';

/**
 * Ubicación en el chat web (como el 📎 → Ubicación de WhatsApp).
 * Se envía como texto "📍 nombre\nhttps://maps.google.com/?q=lat,lon": Chatwoot no permite crear adjuntos de
 * ubicación por la API, y el bot (iagro-bot.json, "Parsear Mensaje") reconoce ese enlace igual que un 📎.
 * Mapas gratis y sin clave: satélite de Esri, calles de OpenStreetMap; direcciones y búsqueda con Nominatim.
 */

export type Punto = { lat: number; lon: number };
export type Ubicacion = Punto & { nombre: string };

const RE_UBICACION = /^📍\s*([^\n]*)\n\s*https:\/\/maps\.google\.com\/\?q=(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)\s*$/u;
const SANTA_CRUZ: Punto = { lat: -17.786, lon: -63.181 };
const NOMINATIM = 'https://nominatim.openstreetmap.org';

export const textoUbicacion = (u: Ubicacion) =>
  `📍 ${u.nombre.replace(/\s+/g, ' ').trim() || 'Ubicación'}\nhttps://maps.google.com/?q=${u.lat.toFixed(6)},${u.lon.toFixed(6)}`;

/** Lee un mensaje de ubicación del chat web (null si es un texto común) */
export function leerUbicacion(texto: string | null): Ubicacion | null {
  const m = texto?.match(RE_UBICACION);
  return m ? { nombre: m[1].trim() || 'Ubicación', lat: Number(m[2]), lon: Number(m[3]) } : null;
}

const urlMapa = (p: Punto) => `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`;

function Pin({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 44" aria-hidden="true">
      <path d="M16 0C7.2 0 0 7 0 15.7 0 27.4 16 44 16 44s16-16.6 16-28.3C32 7 24.8 0 16 0z" fill="#e53935" />
      <circle cx="16" cy="15.5" r="6" fill="#fff" />
    </svg>
  );
}

/** Vista previa del mapa dentro de la burbuja: mosaicos de OpenStreetMap, sin cargar Leaflet */
function Miniatura({ lat, lon }: Punto) {
  const z = 15, ancho = 300, alto = 150;
  const n = 2 ** z * 256;
  const r = (lat * Math.PI) / 180;
  const px = ((lon + 180) / 360) * n;
  const py = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  const x0 = px - ancho / 2, y0 = py - alto / 2;
  const mosaicos: { x: number; y: number }[] = [];
  for (let x = Math.floor(x0 / 256); x <= Math.floor((x0 + ancho) / 256); x++) {
    for (let y = Math.floor(y0 / 256); y <= Math.floor((y0 + alto) / 256); y++) mosaicos.push({ x, y });
  }
  return (
    <div className={s.miniatura}>
      <div className={s.miniaturaLienzo} style={{ width: ancho, height: alto }}>
        {mosaicos.map((t) => (
          <img key={`${t.x}-${t.y}`} src={`https://tile.openstreetmap.org/${z}/${t.x}/${t.y}.png`} alt=""
               style={{ left: t.x * 256 - x0, top: t.y * 256 - y0 }} loading="lazy" draggable={false} />
        ))}
      </div>
      <Pin className={s.miniaturaPin} />
    </div>
  );
}

/** Tarjeta de ubicación de un mensaje (enviada desde el chat web o adjunto de WhatsApp) */
export function TarjetaUbicacion({ u }: { u: Ubicacion }) {
  return (
    <a className={s.tarjetaUbicacion} href={urlMapa(u)} target="_blank" rel="noopener noreferrer">
      <Miniatura lat={u.lat} lon={u.lon} />
      <strong>{u.nombre}</strong>
      <small>{u.lat.toFixed(5)}, {u.lon.toFixed(5)}</small>
    </a>
  );
}

/** Satélite de Esri (con nombres de lugares) y calles de OpenStreetMap */
function crearCapas(L: typeof Leaflet) {
  return {
    satelite: L.layerGroup([
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri' }),
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }),
    ]) as Leaflet.Layer,
    mapa: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }) as Leaflet.Layer,
  };
}

const cargarLeaflet = () => import('leaflet').then((mod) => (mod as unknown as { default?: typeof Leaflet }).default ?? mod);

const PIN_HTML = '<svg viewBox="0 0 32 44" width="34" height="46" style="filter:drop-shadow(0 3px 3px rgba(0,0,0,.4))"><path d="M16 0C7.2 0 0 7 0 15.7 0 27.4 16 44 16 44s16-16.6 16-28.3C32 7 24.8 0 16 0z" fill="#e53935"/><circle cx="16" cy="15.5" r="6" fill="#fff"/></svg>';

export type Campo = { id: number; nombre: string | null; lat: number | null; lon: number | null; zona?: string | null };

/**
 * La ubicación que el cliente tiene registrada en el sistema (la que usan su pronóstico y sus alertas).
 * Se abre con el 📍 de la cabecera; "Cambiar ubicación" abre el selector para enviar una nueva.
 */
export function MiUbicacion({ telefono, firma, inicial, alCambiar, alCerrar }: {
  telefono: string; firma: string; inicial: Campo | null; alCambiar: () => void; alCerrar: () => void;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const mapa = useRef<Leaflet.Map | null>(null);
  const capas = useRef<{ satelite: Leaflet.Layer; mapa: Leaflet.Layer } | null>(null);
  const [campo, setCampo] = useState<Campo | null>(inicial);
  const [cargando, setCargando] = useState(true);
  const [capa, setCapa] = useState<'satelite' | 'mapa'>('satelite');

  // Datos al día (si cambió la ubicación por el chat, la página puede tener la anterior)
  useEffect(() => {
    fetch(`/chat/${telefono}/campo?k=${encodeURIComponent(firma)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j) setCampo(j.campo); })
      .catch(() => {})
      .finally(() => setCargando(false));
  }, [telefono, firma]);

  const lat = campo?.lat ?? null;
  const lon = campo?.lon ?? null;

  useEffect(() => {
    if (lat == null || lon == null) return;
    let vivo = true;
    cargarLeaflet().then((L) => {
      if (!vivo || !caja.current) return;
      const m = L.map(caja.current, { zoomControl: false }).setView([lat, lon], 16);
      m.attributionControl.setPrefix(false);
      capas.current = crearCapas(L);
      capas.current.satelite.addTo(m);
      L.marker([lat, lon], { icon: L.divIcon({ className: '', html: PIN_HTML, iconSize: [34, 46], iconAnchor: [17, 46] }), interactive: false }).addTo(m);
      mapa.current = m;
      setTimeout(() => m.invalidateSize(), 50);
    });
    return () => { vivo = false; mapa.current?.remove(); mapa.current = null; };
  }, [lat, lon]);

  useEffect(() => {
    const m = mapa.current, c = capas.current;
    if (!m || !c) return;
    const [poner, sacar] = capa === 'satelite' ? [c.satelite, c.mapa] : [c.mapa, c.satelite];
    m.removeLayer(sacar);
    if (!m.hasLayer(poner)) poner.addTo(m);
  }, [capa]);

  return (
    <div className={s.selector} role="dialog" aria-modal="true" aria-label="Mi ubicación registrada">
      <header className={s.perfilCabecera}>
        <button type="button" onClick={alCerrar} aria-label="Volver">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z" fill="currentColor" /></svg>
        </button>
        <span className={s.selectorTitulo}>Mi ubicación registrada</span>
      </header>

      {lat != null && lon != null ? (
        <>
          <div className={s.selectorMapa}>
            <div ref={caja} className={s.selectorLienzo} />
            <div className={s.selectorBotones}>
              <button type="button" onClick={() => setCapa(capa === 'satelite' ? 'mapa' : 'satelite')} aria-label="Cambiar mapa">
                {capa === 'satelite' ? '🗺️' : '🛰️'}<span>{capa === 'satelite' ? 'Mapa' : 'Satélite'}</span>
              </button>
              <button type="button" onClick={() => mapa.current?.setView([lat, lon], 16)} aria-label="Centrar en mi lote">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm9 3h-2.1A7 7 0 0 0 13 5.1V3h-2v2.1A7 7 0 0 0 5.1 11H3v2h2.1a7 7 0 0 0 5.9 5.9V21h2v-2.1a7 7 0 0 0 5.9-5.9H21v-2zm-9 6a5 5 0 1 1 0-10 5 5 0 0 1 0 10z" fill="currentColor" /></svg>
              </button>
            </div>
          </div>
          <div className={s.campoPanel}>
            <div className={s.campoDatos}>
              <span className={s.selectorIcono}>📍</span>
              <div>
                <strong>{campo?.nombre?.trim() || 'Mi campo'}</strong>
                <small>{[campo?.zona, `${lat.toFixed(5)}, ${lon.toFixed(5)}`].filter(Boolean).join(' · ')}</small>
              </div>
            </div>
            <p className={s.campoNota}>Con esta ubicación te enviamos el pronóstico y las alertas de lluvia.</p>
            <div className={s.campoAcciones}>
              <a href={urlMapa({ lat, lon })} target="_blank" rel="noopener noreferrer">🧭 Cómo llegar</a>
              {campo?.id && <a href={`/radar/${campo.id}`} target="_blank" rel="noopener noreferrer">🌧️ Mi radar</a>}
              <button type="button" className={s.campoPrincipal} onClick={alCambiar}>✏️ Cambiar ubicación</button>
            </div>
          </div>
        </>
      ) : (
        <div className={s.campoVacio}>
          {cargando ? <p>Cargando tu ubicación…</p> : (
            <>
              <div className={s.tutorialIcono}>📍</div>
              <h2>Aún no tienes una ubicación registrada</h2>
              <p>Envíanos la ubicación de tu lote y te mandamos el pronóstico y las alertas de lluvia de ese lugar.</p>
              <button type="button" className={s.tutorialBoton} onClick={alCambiar}>Enviar mi ubicación</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

type Direccion = { nombre: string; detalle: string };

/** "Calle X, Barrio, Ciudad, Santa Cruz" a partir de la respuesta de Nominatim */
function direccionDe(j: { name?: string; display_name?: string; address?: Record<string, string> }): Direccion {
  const a = j.address ?? {};
  const lugar = a.village || a.town || a.city || a.hamlet || a.municipality || a.county || '';
  const calle = [a.road, a.house_number].filter(Boolean).join(' ');
  const nombre = j.name || calle || a.suburb || a.neighbourhood || lugar || (j.display_name ?? '').split(',')[0] || 'Ubicación';
  const detalle = [calle && calle !== nombre ? calle : '', a.suburb, lugar !== nombre ? lugar : '', a.state].filter(Boolean).join(', ');
  return { nombre, detalle };
}

type EstadoGps = 'buscando' | 'ok' | 'denegado' | 'error' | 'no-soportado';

export function SelectorUbicacion({ inicial, alEnviar, alCerrar }: {
  inicial: Punto | null; alEnviar: (u: Ubicacion) => void; alCerrar: () => void;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const mapa = useRef<Leaflet.Map | null>(null);
  const lf = useRef<typeof Leaflet | null>(null);
  const capas = useRef<{ satelite: Leaflet.Layer; mapa: Leaflet.Layer } | null>(null);
  const marcaGps = useRef<Leaflet.LayerGroup | null>(null);
  const seguirGps = useRef(true); // el mapa sigue al GPS hasta que la persona lo mueve

  const [listo, setListo] = useState(false);
  const [gps, setGps] = useState<(Punto & { precision: number }) | null>(null);
  const [estadoGps, setEstadoGps] = useState<EstadoGps>('buscando');
  const [centro, setCentro] = useState<Punto | null>(null);
  const [moviendo, setMoviendo] = useState(false);
  const [direccion, setDireccion] = useState<Direccion | null>(null);
  const [capa, setCapa] = useState<'satelite' | 'mapa'>('satelite');
  const [buscar, setBuscar] = useState(false);
  const [consulta, setConsulta] = useState('');
  const [resultados, setResultados] = useState<(Punto & Direccion)[] | null>(null);

  // Mapa
  useEffect(() => {
    let vivo = true;
    import('leaflet').then((mod) => {
      if (!vivo || !caja.current) return;
      const L = (mod as unknown as { default?: typeof Leaflet }).default ?? mod;
      lf.current = L;
      const p = inicial ?? SANTA_CRUZ;
      const m = L.map(caja.current, { zoomControl: false, attributionControl: true }).setView([p.lat, p.lon], inicial ? 15 : 6);
      capas.current = crearCapas(L);
      capas.current.satelite.addTo(m);
      m.attributionControl.setPrefix(false);
      m.on('movestart', () => setMoviendo(true));
      m.on('moveend', () => { setMoviendo(false); const c = m.getCenter(); setCentro({ lat: c.lat, lon: c.lng }); });
      m.on('dragstart', () => { seguirGps.current = false; });
      mapa.current = m;
      setCentro(p);
      setListo(true);
      setTimeout(() => m.invalidateSize(), 50);
    });
    return () => { vivo = false; mapa.current?.remove(); mapa.current = null; };
  }, [inicial]);

  // Cambiar Satélite / Mapa
  useEffect(() => {
    const m = mapa.current, c = capas.current;
    if (!m || !c) return;
    const [poner, sacar] = capa === 'satelite' ? [c.satelite, c.mapa] : [c.mapa, c.satelite];
    m.removeLayer(sacar);
    if (!m.hasLayer(poner)) poner.addTo(m);
  }, [capa, listo]);

  // GPS del celular (alta precisión)
  const pedirGps = useCallback(() => {
    if (!('geolocation' in navigator)) { setEstadoGps('no-soportado'); return () => {}; }
    setEstadoGps((e) => (e === 'ok' ? e : 'buscando'));
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setGps({ lat: pos.coords.latitude, lon: pos.coords.longitude, precision: Math.round(pos.coords.accuracy) });
        setEstadoGps('ok');
      },
      (err) => setEstadoGps(err.code === err.PERMISSION_DENIED ? 'denegado' : 'error'),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);
  useEffect(() => pedirGps(), [pedirGps]);

  // Punto azul con el círculo de precisión
  useEffect(() => {
    const m = mapa.current, L = lf.current;
    if (!m || !L || !gps) return;
    marcaGps.current?.remove();
    marcaGps.current = L.layerGroup([
      L.circle([gps.lat, gps.lon], { radius: gps.precision, color: '#1a73e8', weight: 1, fillColor: '#1a73e8', fillOpacity: 0.12, interactive: false }),
      L.circleMarker([gps.lat, gps.lon], { radius: 8, color: '#fff', weight: 3, fillColor: '#1a73e8', fillOpacity: 1, interactive: false }),
    ]).addTo(m);
    if (seguirGps.current) m.setView([gps.lat, gps.lon], Math.max(m.getZoom(), 17));
  }, [gps, listo]);

  // Dirección del punto del centro (Nominatim pide como máximo 1 consulta por segundo)
  useEffect(() => {
    if (!centro || moviendo) return;
    setDireccion(null);
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`${NOMINATIM}/reverse?format=jsonv2&lat=${centro.lat}&lon=${centro.lon}&zoom=17&accept-language=es`, { signal: ctl.signal })
        .then((r) => r.json())
        .then((j) => setDireccion(j?.error ? { nombre: 'Ubicación', detalle: '' } : direccionDe(j)))
        .catch(() => {});
    }, 900);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [centro, moviendo]);

  // Búsqueda de lugares en Bolivia
  useEffect(() => {
    const q = consulta.trim();
    if (q.length < 3) { setResultados(null); return; }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`${NOMINATIM}/search?format=jsonv2&addressdetails=1&countrycodes=bo&limit=6&accept-language=es&q=${encodeURIComponent(q)}`, { signal: ctl.signal })
        .then((r) => r.json())
        .then((lista: { lat: string; lon: string; name?: string; display_name?: string; address?: Record<string, string> }[]) =>
          setResultados(lista.map((x) => ({ lat: Number(x.lat), lon: Number(x.lon), ...direccionDe(x) }))))
        .catch(() => {});
    }, 600);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [consulta]);

  const irA = (p: Punto, zoom = 17) => { seguirGps.current = false; mapa.current?.setView([p.lat, p.lon], zoom); };
  const miUbicacion = () => {
    if (gps) { seguirGps.current = true; mapa.current?.setView([gps.lat, gps.lon], 17); }
    else pedirGps();
  };

  // "Enviar esta ubicación" aparece cuando el centro del mapa ya no es el punto del GPS
  const metrosDelGps = gps && centro && mapa.current ? mapa.current.distance([gps.lat, gps.lon], [centro.lat, centro.lon]) : Infinity;
  const lejosDelGps = metrosDelGps > Math.max(25, gps?.precision ?? 0);

  return (
    <div className={s.selector} role="dialog" aria-modal="true" aria-label="Enviar ubicación">
      <header className={s.perfilCabecera}>
        <button type="button" onClick={buscar ? () => { setBuscar(false); setConsulta(''); } : alCerrar} aria-label="Volver">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z" fill="currentColor" /></svg>
        </button>
        {buscar ? (
          <input className={s.selectorBuscar} autoFocus value={consulta} onChange={(e) => setConsulta(e.target.value)} placeholder="Buscar un lugar en Bolivia…" enterKeyHint="search" />
        ) : (
          <span className={s.selectorTitulo}>Enviar ubicación</span>
        )}
        {!buscar && (
          <button type="button" onClick={() => setBuscar(true)} aria-label="Buscar lugar">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 14h-.8l-.3-.3A6.5 6.5 0 1 0 9.5 16a6.5 6.5 0 0 0 4.2-1.6l.3.3v.8l5 5 1.5-1.5-5-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z" fill="currentColor" /></svg>
          </button>
        )}
      </header>

      <div className={s.selectorMapa}>
        <div ref={caja} className={s.selectorLienzo} />
        <Pin className={`${s.selectorPin} ${moviendo ? s.selectorPinArriba : ''}`} />
        <span className={s.selectorSombra} aria-hidden="true" />
        <div className={s.selectorBotones}>
          <button type="button" onClick={() => setCapa(capa === 'satelite' ? 'mapa' : 'satelite')} aria-label="Cambiar mapa">
            {capa === 'satelite' ? '🗺️' : '🛰️'}<span>{capa === 'satelite' ? 'Mapa' : 'Satélite'}</span>
          </button>
          <button type="button" onClick={miUbicacion} aria-label="Ir a mi ubicación" className={seguirGps.current && gps ? s.activo : ''}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm9 3h-2.1A7 7 0 0 0 13 5.1V3h-2v2.1A7 7 0 0 0 5.1 11H3v2h2.1a7 7 0 0 0 5.9 5.9V21h2v-2.1a7 7 0 0 0 5.9-5.9H21v-2zm-9 6a5 5 0 1 1 0-10 5 5 0 0 1 0 10z" fill="currentColor" /></svg>
          </button>
        </div>

        {buscar && resultados && (
          <ul className={s.selectorResultados}>
            {resultados.length === 0 && <li className={s.selectorVacio}>No se encontraron lugares.</li>}
            {resultados.map((r, i) => (
              <li key={i}>
                <button type="button" onClick={() => { irA(r, 15); setBuscar(false); setConsulta(''); }}>
                  <span>📍</span><span><strong>{r.nombre}</strong><small>{r.detalle}</small></span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={s.selectorPanel}>
        {estadoGps === 'buscando' && !gps && <p className={s.selectorAviso}>🛰️ Buscando tu ubicación…</p>}
        {estadoGps === 'denegado' && <p className={s.selectorAviso}>No diste permiso de ubicación. Mueve el mapa hasta tu lote, o actívala en el candado 🔒 junto a la dirección.</p>}
        {(estadoGps === 'error' || estadoGps === 'no-soportado') && !gps && <p className={s.selectorAviso}>No se pudo leer el GPS. Mueve el mapa hasta tu lote y envía esa ubicación.</p>}

        {gps && (
          <button type="button" className={s.selectorOpcion} onClick={() => alEnviar({ lat: gps.lat, lon: gps.lon, nombre: 'Mi ubicación' })}>
            <span className={`${s.selectorIcono} ${s.selectorIconoGps}`}>◉</span>
            <span><strong>Enviar tu ubicación actual</strong><small>Precisión: ±{gps.precision} m</small></span>
          </button>
        )}
        {centro && (lejosDelGps || !gps) && (
          <button type="button" className={s.selectorOpcion} disabled={moviendo} onClick={() => alEnviar({ ...centro, nombre: direccion?.nombre ?? 'Ubicación' })}>
            <span className={s.selectorIcono}>📍</span>
            <span>
              <strong>Enviar esta ubicación</strong>
              <small>{moviendo ? 'Suelta el mapa en tu lote…' : direccion ? [direccion.nombre, direccion.detalle].filter(Boolean).join(' · ') : `${centro.lat.toFixed(5)}, ${centro.lon.toFixed(5)}`}</small>
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
