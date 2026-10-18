import { requerirSesion } from '@/lib/auth';
import { Shell } from '@/components/shell';

export const dynamic = 'force-dynamic';

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const sesion = await requerirSesion();
  return <Shell admin={{ nombre: sesion.nombre, usuario: sesion.usuario }}>{children}</Shell>;
}
