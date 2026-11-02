import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { query, sql } from '@/lib/db';
import { interRadar as inter, monoRadar as mono, zillaRadar as zilla } from '@/fuentes/fuentes';
import s from './radar.module.css';

export const dynamic = 'force-dynamic';

type Campo = { nombre: string | null; lat: number | null; lon: number | null };

/**
 * Campo del cliente (bot_clima.usuarios: la misma ficha que edita el panel y que usan el bot y las alertas).
 * /radar/santa-cruz: radar general, para el botón "Ver radar" del bot de WhatsApp a quien aún no envió su ubicación.
 */
const campo = cache(async (id: string): Promise<Campo | null> => {
  if (id === 'santa-cruz') return { nombre: 'Santa Cruz de la Sierra', lat: -17.7833, lon: -63.1821 };
  if (!/^\d{1,12}$/.test(id)) return null;
  const [c] = await query<Campo>(sql`
    SELECT nombre, latitud AS lat, longitud AS lon FROM bot_clima.usuarios WHERE id = ${Number(id)}`);
  return c ?? null;
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const c = await campo((await params).id);
  return {
    title: { absolute: c ? `${c.nombre ?? 'Mi campo'} · Radar de lluvia iAgro` : 'Radar no encontrado · iAgro' },
    icons: { icon: '/img/logo.png' },
    robots: { index: false, follow: false },
  };
}

export const viewport = { themeColor: '#101c37', maximumScale: 1, userScalable: false };

export default async function RadarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await campo(id);
  if (!c) notFound();

  const nombre = c.nombre?.trim() || `Radar ${id}`;
  const conUbicacion = Number.isFinite(c.lat) && Number.isFinite(c.lon) && c.lat !== null && c.lon !== null;
  const mapa = conUbicacion
    ? `https://embed.ventusky.com/?p=${c.lat};${c.lon};5&l=rain-3h&w=soft&pin=${c.lat};${c.lon};dot;${encodeURIComponent(nombre)}`
    : null;

  return (
    <div className={`${s.app} ${zilla.variable} ${inter.variable} ${mono.variable}`}>
      <div className={s.mapa}>
        <div className={s.cargando}>{mapa ? 'Cargando pronóstico…' : 'Este campo no tiene ubicación registrada'}</div>
        {mapa && (
          <iframe className={s.frame} src={mapa} sandbox="allow-scripts allow-same-origin" allowFullScreen title={`Mapa de precipitación de ${nombre}`} />
        )}
      </div>

      <div className={s.overlay}>
        <header className={s.cabecera}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={s.logo} src="/img/logo.png" alt="iAgro" />
          <div className={s.textos}>
            <div className={s.marca}>iAgro · Temporada de Siembra</div>
            <h1 className={s.nombre}>{nombre}</h1>
            <p className={s.meta}>{conUbicacion ? `Lat ${c.lat}, Lon ${c.lon}` : 'Sin coordenadas'}</p>
          </div>
        </header>
        <div className={s.temporada} aria-hidden="true" />
        <div className={s.leyenda}>
          <span className={s.chip}><span className={`${s.punto} ${s.suave}`} />Suave</span>
          <span className={s.chip}><span className={`${s.punto} ${s.moderada}`} />Moderada</span>
          <span className={s.chip}><span className={`${s.punto} ${s.intensa}`} />Intensa</span>
        </div>
      </div>

      <footer className={s.pie}>
        iAgro · Pronóstico de precipitación en tiempo real · Datos de lluvia por{' '}
        <a href="https://www.ventusky.com" target="_blank" rel="noopener noreferrer">Ventusky.com</a>
      </footer>
    </div>
  );
}
