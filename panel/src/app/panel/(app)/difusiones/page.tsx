import type { Metadata } from 'next';
import Link from 'next/link';
import { MegaphoneIcon, PauseCircleIcon, PlusIcon, RepeatIcon } from 'lucide-react';
import { requerirSesion } from '@/lib/auth';
import { listarDifusiones, usuariosPausados } from '@/lib/datos-difusiones';
import { leerConfig } from '@/lib/datos-config';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Encabezado } from '@/components/shell';
import { Embudo } from '@/components/difusiones/embudo';
import { EstadoDifusionBadge, etiquetaSegmento } from '@/components/difusiones/estado-difusion';
import { Reactivar } from '@/components/difusiones/reactivar';
import { fmtFechaHora, fmtRelativo, fmtTelefono } from '@/lib/utils';

export const metadata: Metadata = { title: 'Difusiones' };

export default async function DifusionesPage() {
  await requerirSesion();
  const [difusiones, pausados, umbralPausa] = await Promise.all([listarDifusiones(), usuariosPausados(), leerConfig<number>('difusion_pausar_sin_respuesta')]);

  return (
    <>
      <Encabezado titulo="Difusiones" descripcion="Mensajes masivos por WhatsApp y quién recibió, leyó y respondió.">
        <Button asChild><Link href="/panel/difusiones/nueva"><PlusIcon /> Nueva difusión</Link></Button>
      </Encabezado>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="grid content-start gap-3 xl:col-span-2">
          {difusiones.length === 0 ? (
            <Card className="flex flex-col items-center gap-3 p-10 text-center">
              <MegaphoneIcon className="size-8 text-muted-foreground" />
              <p className="font-medium">Todavía no hay difusiones</p>
              <Button asChild><Link href="/panel/difusiones/nueva"><PlusIcon /> Crear la primera</Link></Button>
            </Card>
          ) : difusiones.map((d) => (
            <Link key={d.id} href={`/panel/difusiones/${d.id}`} className="block rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
              <Card className="p-5 transition-colors hover:border-primary/40">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">
                      {d.difusion_origen_id && <RepeatIcon className="size-4 shrink-0 text-muted-foreground" />}
                      <span className="truncate">{d.titulo}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {etiquetaSegmento(d.segmento, d.segmento_zona)} · {d.total_destinatarios} destinatario{d.total_destinatarios === 1 ? '' : 's'} ·{' '}
                      {d.enviada_el ? `enviada ${fmtRelativo(d.enviada_el)}` : `creada ${fmtFechaHora(d.created_at)}`}
                    </p>
                  </div>
                  <EstadoDifusionBadge estado={d.estado} />
                </div>
                {d.estado === 'borrador' ? (
                  <p className="line-clamp-2 text-sm text-muted-foreground">{d.mensaje}</p>
                ) : (
                  <Embudo total={d.total_destinatarios} enviados={d.enviados} entregados={d.entregados} leidos={d.leidos} respondieron={d.respondieron} errores={d.errores} compacto />
                )}
              </Card>
            </Link>
          ))}
        </div>

        <Card className="content-start">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><PauseCircleIcon className="size-4" /> Pausados por no responder</CardTitle>
            <CardDescription>
              {Number(umbralPausa) > 0
                ? `No respondieron ${umbralPausa} difusión${Number(umbralPausa) === 1 ? '' : 'es'} seguida${Number(umbralPausa) === 1 ? '' : 's'}: ya no reciben difusiones (sí sus alertas de lluvia). Vuelven solos si escriben.`
                : 'La pausa automática está desactivada (Configuración → Difusiones).'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pausados.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nadie está en pausa.</p>
            ) : (
              <ul className="divide-y">
                {pausados.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 py-2.5">
                    <Link href={`/panel/usuarios/${p.id}`} className="min-w-0 hover:underline">
                      <span className="block truncate text-sm font-medium">{p.nombre ?? fmtTelefono(p.telefono)}</span>
                      <span className="text-xs text-muted-foreground">
                        {p.difusiones_sin_respuesta} sin responder · {p.ultimo_mensaje_el ? `escribió ${fmtRelativo(p.ultimo_mensaje_el)}` : 'nunca escribió'}
                      </span>
                    </Link>
                    <Reactivar usuarioId={p.id} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
