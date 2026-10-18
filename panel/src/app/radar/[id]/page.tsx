import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { IBM_Plex_Mono, Inter, Zilla_Slab } from 'next/font/google';
import { query, sql } from '@/lib/db';
import s from './radar.module.css';

const zilla = Zilla_Slab({ subsets: ['latin'], weight: ['500', '700'], variable: '--f-titulo' });
const inter = Inter({ subsets: ['latin'], weight: ['400', '600', '700'], variable: '--f-texto' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--f-mono' });

export const dynamic = 'force-dynamic';

type Campo = { nombre: string | null; lat: number | null; lon: number | null };

/** Campo del cliente directo de la base (el mismo id que usan el bot y el panel) */
const campo = cache(async (id: string): Promise<Campo | null> => {
  if (!/^\d{1,12}$/.test(id)) return null;
  const [c] = await query<Campo>(sql`
    SELECT nombre_propiedad AS nombre, latitude AS lat, longitude AS lon FROM public.users WHERE id = ${Number(id)}`);
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
