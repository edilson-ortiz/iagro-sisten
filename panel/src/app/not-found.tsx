import type { Metadata } from 'next';
import { Cabecera } from '@/components/sitio/cabecera';
import { Pie } from '@/components/sitio/pie';
import { NoEncontrada } from '@/components/sitio/no-encontrada';
import './(sitio)/sitio.css';

export const metadata: Metadata = { title: 'Página no encontrada — Iagro', icons: { icon: '/img/logo.png' } };

/** 404 del sitio (las del panel usan app/panel/not-found.tsx) */
export default function NotFound() {
  return (
    <>
      <Cabecera />
      <NoEncontrada />
      <Pie />
    </>
  );
}
