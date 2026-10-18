import type { Metadata } from 'next';
import { Cabecera } from '@/components/sitio/cabecera';
import { Pie } from '@/components/sitio/pie';
import './sitio.css';

export const metadata: Metadata = {
  icons: { icon: '/img/logo.png' },
};

/** Sitio público iagro360.xyz: landing, contacto, privacidad, términos */
export default function SitioLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Cabecera />
      {children}
      <Pie />
    </>
  );
}
