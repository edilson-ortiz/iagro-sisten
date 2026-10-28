'use client';

import { useEffect, useRef, useState } from 'react';
import s from './chat.module.css';

/**
 * Compartir un mensaje del bot (como la flecha ↪ de WhatsApp), por ejemplo la invitación con su enlace.
 * En el celular abre el menú "Compartir" del sistema con la imagen y el texto: ahí se elige WhatsApp y
 * los contactos o grupos. Sin ese menú (algunas computadoras) abre WhatsApp Web con el texto.
 */

// La imagen se baja por el panel (/chat/{tel}/archivo): directo de Chatwoot el navegador no la deja leer
const archivos = new Map<string, Promise<File | null>>();

function bajar(url: string): Promise<File | null> {
  let p = archivos.get(url);
  if (!p) {
    p = fetch(url, { cache: 'force-cache' })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => (b ? new File([b], `iagro.${b.type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg'}`, { type: b.type }) : null))
      .catch(() => null);
    archivos.set(url, p);
  }
  return p;
}

/** El bot escribe **negrita** (Chatwoot la convierte para WhatsApp); al compartir va con el formato de WhatsApp */
const textoWhatsApp = (t: string) => t.replace(/\*\*([^*\n]+)\*\*/g, '*$1*').trim();

export async function compartir(texto: string | null, archivo: File | null) {
  const t = texto ? textoWhatsApp(texto) : '';
  try {
    if (archivo && navigator.canShare?.({ files: [archivo] })) {
      await navigator.share({ files: [archivo], ...(t ? { text: t } : {}) });
      return;
    }
    if (navigator.share && t) {
      await navigator.share({ text: t });
      return;
    }
  } catch (e) {
    if ((e as DOMException).name === 'AbortError') return; // cerró el menú sin elegir
  }
  if (t) window.open(`https://wa.me/?text=${encodeURIComponent(t)}`, '_blank', 'noopener');
}

/** Prepara la imagen apenas el mensaje se ve en pantalla: iPhone exige compartir enseguida después del toque */
export function useArchivo(url: string | null) {
  const ref = useRef<HTMLButtonElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  useEffect(() => {
    if (!url || !ref.current) return;
    let vivo = true;
    const obs = new IntersectionObserver(([e]) => {
      if (!e?.isIntersecting) return;
      obs.disconnect();
      bajar(url).then((f) => { if (vivo) setArchivo(f); });
    }, { rootMargin: '200px' });
    obs.observe(ref.current);
    return () => { vivo = false; obs.disconnect(); };
  }, [url]);
  return { ref, archivo };
}

export function IconoCompartir() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11z" fill="currentColor" /></svg>;
}

/** Botón redondo al costado de la burbuja */
export function BotonCompartir({ texto, imagen }: { texto: string | null; imagen: string | null }) {
  const { ref, archivo } = useArchivo(imagen);
  const [ocupado, setOcupado] = useState(false);
  const tocar = async () => {
    setOcupado(true);
    try { await compartir(texto, archivo ?? (imagen ? await bajar(imagen) : null)); } finally { setOcupado(false); }
  };
  return (
    <button ref={ref} type="button" className={s.compartir} onClick={tocar} disabled={ocupado} aria-label="Compartir" title="Compartir con WhatsApp u otra app">
      <IconoCompartir />
    </button>
  );
}
