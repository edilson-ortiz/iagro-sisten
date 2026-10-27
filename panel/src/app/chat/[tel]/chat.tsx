'use client';

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AdjuntoChat, BotonChat, MensajeChat } from '@/lib/chat-web';
import s from './chat.module.css';

type Pendiente = { clave: string; texto: string; hora: number; fallo: boolean };

// Cada cuánto se buscan mensajes nuevos (ms): rápido mientras el bot responde, lento con la pestaña oculta
const CADA = { normal: 2500, esperando: 1200, oculta: 15000 };
const ESPERA_RESPUESTA = 30_000;

const hora = (t: number) => new Date(t).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });

function dia(t: number) {
  const d = new Date(t);
  const hoy = new Date();
  const ayer = new Date(); ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === hoy.toDateString()) return 'Hoy';
  if (d.toDateString() === ayer.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'long', ...(d.getFullYear() !== hoy.getFullYear() ? { year: 'numeric' } : {}) });
}

const fmtTel = (t: string) => (t.startsWith('591') && t.length === 11 ? `+591 ${t.slice(3)}` : `+${t}`);

/** Formato de WhatsApp: *negrita* (y **negrita**), _cursiva_, ~tachado~, ```mono``` y enlaces */
function formato(texto: string) {
  const partes = texto.split(/(```[\s\S]+?```|\*\*[^*\n]+\*\*|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|https?:\/\/[^\s<]+)/g);
  return partes.map((p, i) => {
    if (!p) return null;
    if (p.startsWith('```') && p.length > 6) return <code key={i}>{p.slice(3, -3)}</code>;
    if (p.startsWith('**') && p.length > 4) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith('*') && p.length > 2) return <strong key={i}>{p.slice(1, -1)}</strong>;
    if (p.startsWith('_') && p.length > 2) return <em key={i}>{p.slice(1, -1)}</em>;
    if (p.startsWith('~') && p.length > 2) return <del key={i}>{p.slice(1, -1)}</del>;
    if (/^https?:\/\//.test(p)) {
      const url = p.replace(/[.,;:!?)]+$/, '');
      return <Fragment key={i}><a href={url} target="_blank" rel="noopener noreferrer">{url}</a>{p.slice(url.length)}</Fragment>;
    }
    return <Fragment key={i}>{p}</Fragment>;
  });
}

function Ticks({ estado }: { estado: 'reloj' | 'enviado' | 'leido' | 'fallo' }) {
  if (estado === 'reloj') {
    return <svg className={s.tick} viewBox="0 0 16 16" aria-label="Enviando"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M8 4.5V8l2.2 1.4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>;
  }
  if (estado === 'fallo') return <span className={s.tickFallo} aria-label="No enviado">!</span>;
  return (
    <svg className={`${s.tick} ${estado === 'leido' ? s.tickLeido : ''}`} viewBox="0 0 18 12" aria-label={estado === 'leido' ? 'Respondido' : 'Enviado'}>
      <path d="M1 6.5 4.6 10 11.5 2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.5 9.2 8.4 10 15.3 2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Adjunto({ a }: { a: AdjuntoChat }) {
  if (a.tipo === 'location' && a.lat != null && a.lon != null) {
    return (
      <a className={s.ubicacion} href={`https://www.google.com/maps?q=${a.lat},${a.lon}`} target="_blank" rel="noopener noreferrer">
        📍 {a.nombre || 'Ubicación'} <span>{a.lat.toFixed(4)}, {a.lon.toFixed(4)}</span>
      </a>
    );
  }
  if (!a.url) return null;
  if (a.tipo === 'image') {
    return <a href={a.url} target="_blank" rel="noopener noreferrer"><img className={s.imagen} src={a.miniatura || a.url} alt="" loading="lazy" /></a>;
  }
  if (a.tipo === 'video') return <video className={s.imagen} src={a.url} controls preload="metadata" />;
  if (a.tipo === 'audio') return <audio className={s.audio} src={a.url} controls preload="metadata" />;
  return <a className={s.archivo} href={a.url} target="_blank" rel="noopener noreferrer">📄 {a.nombre || 'Archivo'}</a>;
}

export function Chat({ telefono, firma }: { telefono: string; firma: string }) {
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [cargado, setCargado] = useState(false);
  const [mas, setMas] = useState(false);
  const [cargandoViejos, setCargandoViejos] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkInvalido, setLinkInvalido] = useState(false);
  const [esperandoDesde, setEsperandoDesde] = useState<number | null>(null);
  const [texto, setTexto] = useState('');
  const [hoja, setHoja] = useState<{ titulo: string; botones: BotonChat[] } | null>(null);

  const lista = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLTextAreaElement>(null);
  const pegadoAbajo = useRef(true);
  const alturaAntes = useRef<number | null>(null);
  const primeraCarga = useRef(false);

  const url = `/chat/${telefono}/mensajes`;

  const unir = useCallback((nuevos: MensajeChat[]) => {
    if (!nuevos.length) return;
    setMensajes((prev) => {
      const porId = new Map(prev.map((m) => [m.id, m]));
      for (const m of nuevos) porId.set(m.id, m);
      return [...porId.values()].sort((a, b) => a.id - b.id);
    });
  }, []);

  // Consulta periódica de mensajes nuevos
  const esperandoRef = useRef(esperandoDesde);
  esperandoRef.current = esperandoDesde;
  useEffect(() => {
    let vivo = true;
    let timer: ReturnType<typeof setTimeout>;
    const ciclo = async () => {
      try {
        const r = await fetch(`${url}?k=${encodeURIComponent(firma)}`, { cache: 'no-store' });
        const j = await r.json().catch(() => ({}));
        if (!vivo) return;
        if (r.status === 401) { setLinkInvalido(true); return; }
        if (!r.ok) throw new Error(j.error || 'Sin conexión');
        unir(j.mensajes ?? []);
        if (!primeraCarga.current) { primeraCarga.current = true; setMas(!!j.mas); setCargado(true); }
        setError(null);
      } catch (e) {
        if (vivo) setError((e as Error).message === 'Failed to fetch' ? 'Sin conexión. Reintentando…' : (e as Error).message);
      }
      if (!vivo) return;
      const espera = document.hidden ? CADA.oculta : esperandoRef.current ? CADA.esperando : CADA.normal;
      timer = setTimeout(ciclo, espera);
    };
    ciclo();
    const alVolver = () => { if (!document.hidden) { clearTimeout(timer); ciclo(); } };
    document.addEventListener('visibilitychange', alVolver);
    return () => { vivo = false; clearTimeout(timer); document.removeEventListener('visibilitychange', alVolver); };
  }, [url, firma, unir]);

  const ultimoMio = useMemo(() => mensajes.reduce((a, m) => (m.mio ? Math.max(a, m.id) : a), 0), [mensajes]);
  const ultimaRespuesta = useMemo(() => mensajes.reduce((a, m) => (!m.mio ? Math.max(a, m.id) : a), 0), [mensajes]);

  // "escribiendo…" desde que el cliente envía hasta que llega la respuesta (o pasan 30 s)
  useEffect(() => {
    if (esperandoDesde == null) return;
    if (ultimaRespuesta > ultimoMio) { setEsperandoDesde(null); return; }
    const t = setTimeout(() => setEsperandoDesde(null), Math.max(0, esperandoDesde + ESPERA_RESPUESTA - Date.now()));
    return () => clearTimeout(t);
  }, [esperandoDesde, ultimaRespuesta, ultimoMio]);
  const escribiendo = esperandoDesde != null;

  // Scroll: abajo con cada mensaje nuevo (si ya estaba abajo); al cargar viejos, conserva la posición
  useLayoutEffect(() => {
    const el = lista.current;
    if (!el) return;
    if (alturaAntes.current != null) {
      el.scrollTop += el.scrollHeight - alturaAntes.current;
      alturaAntes.current = null;
    } else if (pegadoAbajo.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [mensajes, pendientes, escribiendo]);

  const cargarViejos = useCallback(async () => {
    if (cargandoViejos || !mas || !mensajes.length) return;
    setCargandoViejos(true);
    try {
      const r = await fetch(`${url}?k=${encodeURIComponent(firma)}&antes=${mensajes[0].id}`, { cache: 'no-store' });
      const j = await r.json();
      if (r.ok) {
        alturaAntes.current = lista.current?.scrollHeight ?? null;
        unir(j.mensajes ?? []);
        setMas(!!j.mas && (j.mensajes ?? []).length > 0);
      }
    } finally {
      setCargandoViejos(false);
    }
  }, [cargandoViejos, mas, mensajes, url, firma, unir]);

  const alScroll = () => {
    const el = lista.current;
    if (!el) return;
    pegadoAbajo.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 60) cargarViejos();
  };

  const enviar = useCallback(async (contenido: string, reintento?: string) => {
    const t = contenido.trim();
    if (!t) return;
    const clave = reintento ?? `p${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    setPendientes((p) => reintento
      ? p.map((x) => (x.clave === clave ? { ...x, fallo: false } : x))
      : [...p, { clave, texto: t, hora: Date.now(), fallo: false }]);
    pegadoAbajo.current = true;
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k: firma, texto: t }) });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) { setLinkInvalido(true); return; }
      if (!r.ok) throw new Error(j.error || 'No se pudo enviar.');
      if (j.mensaje) unir([j.mensaje]);
      setPendientes((p) => p.filter((x) => x.clave !== clave));
      setEsperandoDesde(Date.now());
      setError(null);
    } catch (e) {
      setPendientes((p) => p.map((x) => (x.clave === clave ? { ...x, fallo: true } : x)));
      setError((e as Error).message === 'Failed to fetch' ? 'Sin conexión. Toca el mensaje para reintentar.' : (e as Error).message);
    }
  }, [url, firma, unir]);

  const alEnviar = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!texto.trim()) return;
    enviar(texto);
    setTexto('');
    caja.current?.focus();
  };

  // La caja crece con el texto (hasta ~6 líneas)
  useLayoutEffect(() => {
    const el = caja.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [texto]);

  const alTeclear = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // En la computadora Enter envía (Shift+Enter = nueva línea); en el celular Enter es nueva línea, como WhatsApp
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !window.matchMedia('(pointer: coarse)').matches) {
      e.preventDefault();
      alEnviar();
    }
  };

  const tocarBoton = (b: BotonChat) => {
    setHoja(null);
    enviar(b.titulo); // el bot reconoce los botones por su título, igual que en WhatsApp
  };

  useEffect(() => {
    if (!hoja) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setHoja(null); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [hoja]);

  if (linkInvalido) {
    return (
      <main className={s.aviso}>
        <img src="/img/logo.png" alt="" width={72} height={72} />
        <h1>Enlace no válido</h1>
        <p>Pide a IAGRO que te envíe de nuevo el enlace de tu chat.</p>
      </main>
    );
  }

  // Mensajes agrupados por día, con la cola de la burbuja solo en el primero de cada racha
  let diaPrevio = '';
  let autorPrevio: boolean | null = null;

  return (
    <div className={s.app}>
      <header className={s.cabecera}>
        <img className={s.avatar} src="/img/logo.png" alt="" width={40} height={40} />
        <div className={s.titulo}>
          <strong>IAGRO Clima</strong>
          <span>{escribiendo ? 'escribiendo…' : 'en línea'}</span>
        </div>
      </header>

      {error && <div className={s.error} role="status">{error}</div>}

      <div className={s.lista} ref={lista} onScroll={alScroll}>
        <div className={s.contenido}>
          {cargandoViejos && <div className={s.cargando}>Cargando…</div>}
          {!mas && cargado && (
            <div className={s.cifrado}>
              🔒 Chat de <b>{fmtTel(telefono)}</b>. Tus mensajes llegan directo a IAGRO y el asistente te responde aquí mismo.
            </div>
          )}

          {mensajes.map((m) => {
            const d = dia(m.hora);
            const nuevoDia = d !== diaPrevio;
            const cola = nuevoDia || autorPrevio !== m.mio;
            diaPrevio = d;
            autorPrevio = m.mio;
            const lista3 = m.botones.length <= 3;
            return (
              <Fragment key={m.id}>
                {nuevoDia && <div className={s.dia}><span>{d}</span></div>}
                <div className={`${s.fila} ${m.mio ? s.filaMia : ''} ${cola ? s.conCola : ''}`}>
                  <div className={s.grupo}>
                    <div className={`${s.burbuja} ${m.mio ? s.mia : s.suya} ${cola ? s.cola : ''} ${m.botones.length ? s.conBotones : ''}`}>
                      {m.adjuntos.map((a, i) => <Adjunto key={i} a={a} />)}
                      {m.texto && <span className={s.texto}>{formato(m.texto)}</span>}
                      <span className={s.meta}>
                        {hora(m.hora)}
                        {m.mio && <Ticks estado={m.estado === 'failed' ? 'fallo' : ultimaRespuesta > m.id ? 'leido' : 'enviado'} />}
                      </span>
                    </div>
                    {m.botones.length > 0 && (
                      lista3 ? (
                        <div className={s.botones}>
                          {m.botones.map((b) => (
                            <button key={b.valor + b.titulo} type="button" className={s.boton} onClick={() => tocarBoton(b)}>{b.titulo}</button>
                          ))}
                        </div>
                      ) : (
                        <div className={s.botones}>
                          <button type="button" className={s.boton} onClick={() => setHoja({ titulo: 'Elige una opción', botones: m.botones })}>
                            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                            Ver opciones
                          </button>
                        </div>
                      )
                    )}
                  </div>
                </div>
              </Fragment>
            );
          })}

          {pendientes.map((p) => {
            const cola = autorPrevio !== true;
            autorPrevio = true;
            return (
              <div key={p.clave} className={`${s.fila} ${s.filaMia} ${cola ? s.conCola : ''}`}>
                <div className={s.grupo}>
                  <button
                    type="button"
                    className={`${s.burbuja} ${s.mia} ${cola ? s.cola : ''} ${p.fallo ? s.fallida : ''}`}
                    onClick={() => p.fallo && enviar(p.texto, p.clave)}
                    title={p.fallo ? 'Toca para reintentar' : undefined}
                  >
                    <span className={s.texto}>{formato(p.texto)}</span>
                    <span className={s.meta}>{hora(p.hora)}<Ticks estado={p.fallo ? 'fallo' : 'reloj'} /></span>
                  </button>
                  {p.fallo && <span className={s.reintentar}>No se envió · toca para reintentar</span>}
                </div>
              </div>
            );
          })}

          {escribiendo && (
            <div className={`${s.fila} ${s.conCola}`}>
              <div className={`${s.burbuja} ${s.suya} ${s.cola} ${s.puntos}`} aria-label="IAGRO está escribiendo"><i /><i /><i /></div>
            </div>
          )}

          {cargado && !mensajes.length && !pendientes.length && (
            <div className={s.empezar}>
              <p>¡Hola! 👋 Escribe tu consulta o toca el botón para empezar.</p>
              <button type="button" className={s.boton} onClick={() => enviar('Hola')}>👋 Empezar</button>
            </div>
          )}
          {!cargado && !error && <div className={s.cargando}>Cargando chat…</div>}
        </div>
      </div>

      <form className={s.redactor} onSubmit={alEnviar}>
        <div className={s.campo}>
          <textarea
            ref={caja}
            rows={1}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={alTeclear}
            placeholder="Mensaje"
            aria-label="Mensaje"
            maxLength={4000}
            enterKeyHint="send"
          />
        </div>
        <button type="submit" className={s.enviar} disabled={!texto.trim()} aria-label="Enviar">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.4 20.4 21 12 3.4 3.6 3.4 10.2 15 12 3.4 13.8z" fill="currentColor" /></svg>
        </button>
      </form>

      {hoja && (
        <div className={s.fondoHoja} onClick={() => setHoja(null)}>
          <div className={s.hoja} role="dialog" aria-modal="true" aria-label={hoja.titulo} onClick={(e) => e.stopPropagation()}>
            <div className={s.hojaCabecera}>
              <button type="button" className={s.cerrar} onClick={() => setHoja(null)} aria-label="Cerrar">✕</button>
              <strong>{hoja.titulo}</strong>
            </div>
            <ul className={s.opciones}>
              {hoja.botones.map((b) => (
                <li key={b.valor + b.titulo}>
                  <button type="button" onClick={() => tocarBoton(b)}>
                    <span>{b.titulo}</span>
                    <i className={s.radio} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
