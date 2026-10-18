import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { MegaphoneIcon, PlusIcon, WebhookIcon } from 'lucide-react';
import { requerirSesion } from '@/lib/auth';
import { listarCampanas } from '@/lib/datos-campanas';
import { leerConfig } from '@/lib/datos-config';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Encabezado } from '@/components/shell';
import { AutoRefresco } from '@/components/auto-refresco';
import { EstadoCampanaBadge } from '@/components/campanas/estado-campana';
import { fmtFechaHora, fmtRelativo } from '@/lib/utils';

export const metadata: Metadata = { title: 'Difusiones' };

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');

export default async function CampanasPage() {
  await requerirSesion();
  const [campanas, token, h] = await Promise.all([listarCampanas(), leerConfig<string>('chatwoot_webhook_token'), headers()]);
  const origen = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('x-forwarded-host') ?? h.get('host')}`;
  const activa = campanas.some((c) => c.estado === 'enviando' || c.estado === 'programada');

  return (
    <>
      <AutoRefresco segundos={activa ? 10 : 120} />
      <Encabezado titulo="Difusiones" descripcion="Envía una plantilla de WhatsApp aprobada por Meta a una lista de números (CSV o Excel), ahora o programada.">
        <Button asChild><Link href="/panel/campanas/nueva"><PlusIcon /> Nueva difusión</Link></Button>
      </Encabezado>

      {campanas.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-10 text-center">
          <MegaphoneIcon className="size-8 text-muted-foreground" />
          <p className="font-medium">Todavía no hay difusiones</p>
          <p className="max-w-md text-sm text-muted-foreground">Carga un archivo con los números, elige una plantilla y envíala ahora o prográmala.</p>
          <Button asChild className="mt-2"><Link href="/panel/campanas/nueva"><PlusIcon /> Crear la primera</Link></Button>
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow className="hover:bg-transparent">
              <TableHead>Difusión</TableHead><TableHead>Plantilla</TableHead><TableHead>Estado</TableHead><TableHead>Envío</TableHead>
              <TableHead>Progreso</TableHead><TableHead className="text-right">Leídos</TableHead><TableHead className="text-right">Respondieron</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {campanas.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="max-w-64">
                    <Link href={`/panel/campanas/${c.id}`} className="block truncate font-medium hover:underline">{c.nombre}</Link>
                    {c.descripcion && <span className="block truncate text-xs text-muted-foreground">{c.descripcion}</span>}
                  </TableCell>
                  <TableCell className="text-sm"><code>{c.plantilla_nombre}</code></TableCell>
                  <TableCell><EstadoCampanaBadge estado={c.estado} /></TableCell>
                  <TableCell className="text-sm text-muted-foreground" title={fmtFechaHora(c.programada_para)}>
                    {c.estado === 'programada' ? <>Programada {fmtRelativo(c.programada_para)}</> : c.primer_envio ? fmtFechaHora(c.primer_envio) : fmtFechaHora(c.programada_para)}
                  </TableCell>
                  <TableCell>
                    <div className="grid min-w-36 gap-1">
                      <span className="text-sm tabular-nums"><strong>{(c.enviados + c.fallidos).toLocaleString('es-BO')}</strong> <span className="text-muted-foreground">/ {c.total.toLocaleString('es-BO')}</span></span>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Procesados"
                        aria-valuenow={c.total ? Math.round(((c.enviados + c.fallidos) / c.total) * 100) : 0} aria-valuemin={0} aria-valuemax={100}>
                        <div className="h-full rounded-full bg-[#3987e5]" style={{ width: pct(c.enviados + c.fallidos, c.total) }} />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{pct(c.leidos, c.enviados)}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.respondieron.toLocaleString('es-BO')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <details className="mt-6 rounded-xl border bg-card p-4 text-sm">
        <summary className="flex cursor-pointer items-center gap-2 font-medium"><WebhookIcon className="size-4" /> Estados al instante (webhook de Chatwoot)</summary>
        <div className="mt-3 grid gap-2 text-muted-foreground">
          <p>Sin webhook, el panel consulta a Chatwoot cada pocos minutos. Con el webhook, entregado, leído y las respuestas se ven al instante:</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>En Chatwoot: <strong>Configuración → Integraciones → Webhooks → Agregar</strong>.</li>
            <li>Pega esta URL (usa la dirección pública del sitio, ej. https://iagro360.xyz):
              <code className="mt-1 block break-all rounded bg-muted px-2 py-1 text-foreground">{origen}/panel/api/chatwoot/webhook?token={token}</code>
            </li>
            <li>Marca los eventos <strong>Mensaje creado</strong> y <strong>Mensaje actualizado</strong>.</li>
          </ol>
        </div>
      </details>
    </>
  );
}
