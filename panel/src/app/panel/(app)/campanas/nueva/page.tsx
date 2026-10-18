import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeftIcon } from 'lucide-react';
import { requerirSesion } from '@/lib/auth';
import { confChatwoot } from '@/lib/chatwoot';
import { plantillasWhatsApp, type Plantilla } from '@/lib/campanas/chatwoot';
import { Encabezado } from '@/components/shell';
import { FormCampana } from '@/components/campanas/form-campana';

export const metadata: Metadata = { title: 'Nueva difusión' };

export default async function NuevaCampanaPage() {
  await requerirSesion();
  let plantillas: Plantilla[] = [];
  let error: string | undefined;
  const conf = await confChatwoot();
  if ('error' in conf) error = conf.error;
  else {
    try { plantillas = await plantillasWhatsApp(conf); } catch (err) { error = `No se pudieron leer las plantillas de Chatwoot: ${(err as Error).message}`; }
  }

  return (
    <>
      <Link href="/panel/campanas" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Difusiones
      </Link>
      <Encabezado titulo="Nueva difusión" descripcion="Elige la plantilla, carga los contactos y revisa cómo se verá antes de enviar." />
      <FormCampana plantillasIniciales={plantillas} errorPlantillas={error} />
    </>
  );
}
