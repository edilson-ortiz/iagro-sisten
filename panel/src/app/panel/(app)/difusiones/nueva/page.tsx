import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeftIcon } from 'lucide-react';
import { requerirSesion } from '@/lib/auth';
import { listarZonas } from '@/lib/datos';
import { leerConfig } from '@/lib/datos-config';
import { Encabezado } from '@/components/shell';
import { FormDifusion } from '@/components/difusiones/form-difusion';

export const metadata: Metadata = { title: 'Nueva difusión' };

export default async function NuevaDifusionPage() {
  await requerirSesion();
  const [zonas, plantilla, pausa] = await Promise.all([
    listarZonas(), leerConfig<string>('plantilla_difusion'), leerConfig<number>('difusion_pausar_sin_respuesta'),
  ]);
  return (
    <>
      <Link href="/panel/difusiones" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Difusiones
      </Link>
      <Encabezado titulo="Nueva difusión" descripcion="Escribe el mensaje, elige a quién y revisa la vista previa antes de enviar." />
      <FormDifusion zonas={zonas} plantillaDefecto={plantilla ?? ''} pausaActiva={Number(pausa) > 0} />
    </>
  );
}
