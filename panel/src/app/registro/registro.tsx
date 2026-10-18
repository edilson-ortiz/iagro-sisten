'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import type { Map as MapaLeaflet } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { iniciarRegistro } from './actions';
import s from './registro.module.css';

const CENTRO: [number, number] = [-17.7833, -63.1821]; // Santa Cruz de la Sierra
type Resultado = { display_name: string; lat: string; lon: string };

/** Registro: el productor mueve el mapa hasta su campo, pone el nombre y sigue por WhatsApp con su código */
export function Registro({ whatsapp }: { whatsapp: string }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaLeaflet | null>(null);
  const [punto, setPunto] = useState({ lat: CENTRO[0], lng: CENTRO[1] });
  const [quieto, setQuieto] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [formulario, setFormulario] = useState(false);
  const [nombre, setNombre] = useState('');
  const [estado, setEstado] = useState<{ tipo: 'error' | 'cargando'; texto: string } | null>(null);
  const [enviando, iniciar] = useTransition();

  // Mapa satelital (Esri, sin token). El pin queda fijo al centro y se mueve el mapa.
  useEffect(() => {
    let cancelado = false;
    let alCambiarTamano: (() => void) | undefined;
    import('leaflet').then((L) => {
      if (cancelado || !contenedor.current || mapa.current) return;
      const m = L.map(contenedor.current, { zoomControl: false }).setView(CENTRO, 17);
      L.control.zoom({ position: 'topright' }).addTo(m);
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
        maxZoom: 19,
      }).addTo(m);
      m.on('movestart', () => setQuieto(false));
      m.on('moveend', () => { const c = m.getCenter(); setPunto({ lat: c.lat, lng: c.lng }); setQuieto(true); });
      mapa.current = m;
      irAMiUbicacion(17, true);
      // En el celular la barra del navegador cambia el alto visible: se reajusta para que el pin siga alineado
      let t: ReturnType<typeof setTimeout>;
      alCambiarTamano = () => { clearTimeout(t); t = setTimeout(() => m.invalidateSize(), 120); };
      window.addEventListener('resize', alCambiarTamano);
    });
    return () => {
      cancelado = true;
      if (alCambiarTamano) window.removeEventListener('resize', alCambiarTamano);
      mapa.current?.remove();
      mapa.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Buscador de direcciones (OpenStreetMap Nominatim, sin token)
  useEffect(() => {
    const q = busqueda.trim();
    if (q.length < 3) { setResultados([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}`);
        setResultados(await r.json());
      } catch { /* sin red: se ignora */ }
    }, 450);
    return () => clearTimeout(t);
  }, [busqueda]);

  // Avisos de ubicación: se ocultan solos
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 5000);
    return () => clearTimeout(t);
  }, [aviso]);

  function irAMiUbicacion(zoom: number, silencioso: boolean) {
    if (!navigator.geolocation) {
      if (!silencioso) setAviso('Tu navegador no soporta geolocalización.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => mapa.current?.setView([pos.coords.latitude, pos.coords.longitude], zoom),
      (err) => {
        if (silencioso) return; // el intento automático al cargar falla en silencio
        setAviso(
          err.code === 1 ? 'Activa el permiso de ubicación para este sitio: toca el candado o el ícono junto a la URL y permite "Ubicación".'
            : err.code === 2 ? 'No se pudo determinar tu ubicación. Revisa que el GPS del celular esté activado.'
            : err.code === 3 ? 'Tardó demasiado en responder. Intenta de nuevo.'
            : 'No se pudo obtener tu ubicación.',
        );
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  function elegir(r: Resultado) {
    mapa.current?.setView([parseFloat(r.lat), parseFloat(r.lon)], 18);
    setResultados([]);
    setBusqueda(r.display_name);
  }

  function enviar() {
    if (!nombre.trim()) {
      setEstado({ tipo: 'error', texto: 'Escribe el nombre de la propiedad para continuar.' });
      return;
    }
    setEstado({ tipo: 'cargando', texto: 'Generando tu código…' });
    iniciar(async () => {
      const r = await iniciarRegistro({ nombre, lat: punto.lat, lng: punto.lng });
      if ('error' in r) { setEstado({ tipo: 'error', texto: r.error }); return; }
      const texto = `[IAGRO]:[${r.codigo}]\nEnvía este mensaje sin modificarlo para completar tu registro.`;
      window.location.href = `https://wa.me/${whatsapp}?text=${encodeURIComponent(texto)}`;
    });
  }

  return (
    <div className={s.pagina}>
      <header className={s.cabecera}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={s.marca} src="/img/logo.png" alt="iAgro" />
        <div>
          <h1>IAgro</h1>
          <p>Asistente de pronóstico del clima</p>
        </div>
      </header>

      <div className={s.contenedorMapa}>
        <div ref={contenedor} className={s.mapa} />

        <svg className={`${s.pin} ${quieto ? s.pinQuieto : ''}`} viewBox="0 0 34 44" aria-hidden="true">
          <path d="M17 0C7.6 0 0 7.6 0 17c0 12 17 27 17 27s17-15 17-27C34 7.6 26.4 0 17 0z" fill="#1B3A5C" />
          <circle cx="17" cy="17" r="7" fill="#F5F8FA" />
        </svg>

        <div className={s.buscador}>
          <input
            type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar dirección o zona…" autoComplete="off" aria-label="Buscar dirección o zona"
          />
        </div>
        {resultados.length > 0 && (
          <div className={s.resultados}>
            {resultados.map((r, i) => <button key={i} type="button" onClick={() => elegir(r)}>{r.display_name}</button>)}
          </div>
        )}
        {aviso && <div className={s.aviso} role="status">{aviso}</div>}

        <button type="button" className={s.ubicarme} title="Usar mi ubicación" aria-label="Usar mi ubicación" onClick={() => irAMiUbicacion(18, false)}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <circle cx="12" cy="12" r="7" fill="none" stroke="#2D9CDB" strokeWidth="2" />
            <circle cx="12" cy="12" r="2.2" fill="#2D9CDB" />
            <line x1="12" y1="1" x2="12" y2="4.5" stroke="#2D9CDB" strokeWidth="2" strokeLinecap="round" />
            <line x1="12" y1="19.5" x2="12" y2="23" stroke="#2D9CDB" strokeWidth="2" strokeLinecap="round" />
            <line x1="1" y1="12" x2="4.5" y2="12" stroke="#2D9CDB" strokeWidth="2" strokeLinecap="round" />
            <line x1="19.5" y1="12" x2="23" y2="12" stroke="#2D9CDB" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        <div className={s.confirmar}>
          <div className={s.coordenadas}>Ubicación seleccionada<b>{punto.lat.toFixed(5)}, {punto.lng.toFixed(5)}</b></div>
          <button type="button" className={s.boton} onClick={() => setFormulario(true)}>Continuar</button>
        </div>

        <div className={`${s.formulario} ${formulario ? s.abierto : ''}`} aria-hidden={!formulario}>
          <button type="button" className={s.volver} onClick={() => setFormulario(false)}>← Cambiar ubicación</button>
          <h2>Ya casi terminas</h2>
          <p className={s.ayuda}>Con el nombre de tu propiedad generamos un código para vincular tu WhatsApp al asistente de pronóstico de iAgro.</p>
          <label htmlFor="nombre-propiedad">Nombre de la propiedad</label>
          <input
            id="nombre-propiedad" type="text" value={nombre} maxLength={150} placeholder="Ej. Finca La Esperanza"
            onChange={(e) => setNombre(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && enviar()}
          />
          <button type="button" className={`${s.boton} ${s.enviar}`} disabled={enviando} onClick={enviar}>Continuar a WhatsApp</button>
          <div className={`${s.estado} ${estado?.tipo === 'error' ? s.error : ''}`} role={estado?.tipo === 'error' ? 'alert' : undefined}>
            {estado?.texto}
          </div>
        </div>
      </div>
    </div>
  );
}
