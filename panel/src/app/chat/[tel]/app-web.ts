'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * App instalable y notificaciones push del chat web.
 * - Registra el service worker /chat-sw.js (alcance /chat/).
 * - Guarda el aviso "instalar" del navegador (Chrome/Edge en Android y PC) para mostrarlo con un botón propio.
 * - En iPhone las notificaciones solo funcionan con la app instalada (Compartir → Agregar a inicio).
 */

type EventoInstalar = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
export type Permiso = 'default' | 'granted' | 'denied' | 'no-soportado' | 'instalar-primero';

const base64AUint8 = (b64: string) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

export function useAppWeb(telefono: string, firma: string) {
  const [aviso, setAviso] = useState<EventoInstalar | null>(null);
  const [instalada, setInstalada] = useState(false);
  const [esIOS, setEsIOS] = useState(false);
  const [permiso, setPermiso] = useState<Permiso>('default');
  const [listo, setListo] = useState(false);

  const url = `/chat/${telefono}/push`;

  const suscribir = useCallback(async () => {
    const reg = await navigator.serviceWorker.ready;
    const r = await fetch(`${url}?k=${encodeURIComponent(firma)}`, { cache: 'no-store' });
    if (!r.ok) throw new Error('Las notificaciones no están disponibles.');
    const { clave } = (await r.json()) as { clave: string };
    let sub = await reg.pushManager.getSubscription();
    // Suscrita con otra clave (cambió el servidor): se renueva
    const actual = sub?.options.applicationServerKey;
    if (sub && actual && btoa(String.fromCharCode(...new Uint8Array(actual))) !== btoa(String.fromCharCode(...base64AUint8(clave)))) {
      await sub.unsubscribe();
      sub = null;
    }
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64AUint8(clave) });
    await fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ k: firma, suscripcion: sub.toJSON() }),
    });
  }, [url, firma]);

  useEffect(() => {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setEsIOS(ios);
    setInstalada(standalone);

    const soporta = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    setPermiso(soporta ? Notification.permission : ios && !standalone ? 'instalar-primero' : 'no-soportado');

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/chat-sw.js', { scope: '/chat/' })
        // Con el permiso ya dado, se renueva la suscripción en cada visita (por si el navegador la cambió)
        .then(() => { if (soporta && Notification.permission === 'granted') return suscribir(); })
        .catch((e) => console.warn('[chat] service worker', e));
    }

    const alAviso = (e: Event) => { e.preventDefault(); setAviso(e as EventoInstalar); };
    const alInstalar = () => { setInstalada(true); setAviso(null); };
    window.addEventListener('beforeinstallprompt', alAviso);
    window.addEventListener('appinstalled', alInstalar);
    setListo(true);
    return () => {
      window.removeEventListener('beforeinstallprompt', alAviso);
      window.removeEventListener('appinstalled', alInstalar);
    };
  }, [suscribir]);

  /** Pide el permiso y suscribe este navegador. Devuelve el permiso final. */
  const activarNotificaciones = useCallback(async (): Promise<Permiso> => {
    if (permiso === 'no-soportado' || permiso === 'instalar-primero') return permiso;
    const p = await Notification.requestPermission();
    setPermiso(p);
    if (p === 'granted') await suscribir().catch((e) => console.warn('[chat] suscribir', e));
    return p;
  }, [permiso, suscribir]);

  /** Muestra el aviso de instalación del navegador. true si la instaló. */
  const instalar = useCallback(async () => {
    if (!aviso) return false;
    await aviso.prompt();
    const { outcome } = await aviso.userChoice;
    setAviso(null);
    if (outcome === 'accepted') setInstalada(true);
    return outcome === 'accepted';
  }, [aviso]);

  return { listo, instalada, puedeInstalar: !!aviso, esIOS, permiso, activarNotificaciones, instalar };
}

export type AppWeb = ReturnType<typeof useAppWeb>;

/** Lectura y escritura segura de localStorage / sessionStorage (en modo privado pueden fallar) */
export const guardado = {
  leer(clave: string, sesion = false) {
    try { return (sesion ? sessionStorage : localStorage).getItem(clave); } catch { return null; }
  },
  escribir(clave: string, valor: string, sesion = false) {
    try { (sesion ? sessionStorage : localStorage).setItem(clave, valor); } catch { /* sin almacenamiento */ }
  },
};
