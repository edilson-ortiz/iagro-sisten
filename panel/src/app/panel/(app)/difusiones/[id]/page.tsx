import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeftIcon, RepeatIcon } from 'lucide-react';
import { requerirSesion } from '@/lib/auth';
import { enviosDeDifusion, obtenerDifusion } from '@/lib/datos-difusiones';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Encabezado } from '@/components/shell';
import { Embudo } from '@/components/difusiones/embudo';
import { EstadoDifusionBadge, etiquetaSegmento } from '@/components/difusiones/estado-difusion';
import { AccionesDifusion } from '@/components/difusiones/acciones-difusion';
import { TablaEnvios } from '@/components/difusiones/tabla-envios';
import { fmtFechaHora } from '@/lib/utils';

export const metadata: Metadata = { title: 'Detalle de difusión' };

export default async function DetalleDifusionPage({ params }: { params: Promise<{ id: string }> }) {
  await requerirSesion();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const d = await obtenerDifusion(id);
  if (!d) notFound();
  const envios = await enviosDeDifusion(id);
  const sinResponder = envios.filter((e) => e.enviado && !e.respondio && !e.error).length;

  return (
    <>
      <Link href="/panel/difusiones" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Difusiones
      </Link>
      <Encabezado
        titulo={d.titulo}
        descripcion={`${etiquetaSegmento(d.segmento, d.segmento_zona)} · ${d.enviada_el ? `enviada el ${fmtFechaHora(d.enviada_el)}` : `creada el ${fmtFechaHora(d.created_at)}`}${d.creada_por_nombre ? ` por ${d.creada_por_nombre}` : ''}`}
      >
        <EstadoDifusionBadge estado={d.estado} />
        <AccionesDifusion id={d.id} estado={d.estado} destinatarios={d.total_destinatarios} sinResponder={sinResponder} />
      </Encabezado>

      {d.difusion_origen_id && (
        <p className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <RepeatIcon className="size-4" /> Reenvío de{' '}
          <Link href={`/panel/difusiones/${d.difusion_origen_id}`} className="font-medium text-foreground hover:underline">{d.origen_titulo}</Link>
          {' '}— solo a quienes no respondieron.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Resultado</CardTitle>
            <CardDescription>
              {d.total_destinatarios} destinatario{d.total_destinatarios === 1 ? '' : 's'}. Entregado y leído se actualizan cada 10 min; las respuestas, al instante.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Embudo total={d.total_destinatarios} enviados={d.enviados} entregados={d.entregados} leidos={d.leidos} respondieron={d.respondieron} errores={d.errores} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Mensaje</CardTitle></CardHeader>
          <CardContent>
            <p className="rounded-lg bg-muted p-3 text-sm whitespace-pre-wrap">{d.mensaje}</p>
            {d.plantilla && <p className="mt-2 text-xs text-muted-foreground">Plantilla: <code>{d.plantilla}</code></p>}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Destinatarios</CardTitle>
          <CardDescription>Filtra para ver quién leyó, quién respondió y quién no.</CardDescription>
        </CardHeader>
        <CardContent>
          {envios.length === 0
            ? <p className="py-8 text-center text-sm text-muted-foreground">{d.estado === 'borrador' ? 'Los destinatarios se calculan al enviar.' : 'Sin destinatarios.'}</p>
            : <TablaEnvios envios={envios} />}
        </CardContent>
      </Card>
    </>
  );
}
