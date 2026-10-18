import { notFound } from 'next/navigation';
import { MODULOS } from '@/lib/modulos';

/** Mientras el módulo esté apagado, /difusiones no existe para el panel */
export default function DifusionesLayout({ children }: { children: React.ReactNode }) {
  if (!MODULOS.difusiones) notFound();
  return children;
}
