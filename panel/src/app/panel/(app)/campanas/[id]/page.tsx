import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeftIcon, BookOpenCheckIcon, CheckCheckIcon, DownloadIcon, ExternalLinkIcon, MessageCircleReplyIcon, SendIcon, XCircleIcon,
} from 'lucide-react';
import { requerirSesion } from '@/lib/auth';
import { datosChatwoot } from '@/lib/datos';
import { destinatarios, obtenerCampana, POR_PAGINA } from '@/lib/datos-campanas';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatCard } from '@/components/stat-card';
import { FiltrosUrl } from '@/components/filtros-url';
import { AutoRefresco } from '@/components/auto-refresco';
import { VistaPrevia } from '@/components/campanas/vista-previa';
import { BarraEstados } from '@/components/campanas/barra-estados';
import { AccionesCampana } from '@/components/campanas/acciones-campana';
import { EstadoCampanaBadge, EstadoDestinatario } from '@/components/campanas/estado-campana';
import { fmtFechaHora, fmtRelativo, fmtTelefono } from '@/lib/utils';

export const metadata: Metadata = { title: 'Estado de la difusión' };

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');

function Dato({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <span className="rounded-full bg-muted px-3 py-1 text-xs">
      <span className="text-muted-foreground">{etiqueta}:</span> <span className="font-medium">{valor}</span>
    </span>
  );
}

export default async function CampanaPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requerirSesion();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const sp = await searchParams;
  const [c, cw] = await Promise.all([obtenerCampana(id), datosChatwoot()]);
  if (!c) notFound();
  const pagina = Math.max(1, Number(sp.pagina) || 1);
  const lista = await destinatarios(id, { q: sp.q, estado: sp.estado, pagina });
  const paginas = Math.max(1, Math.ceil(lista.total / POR_PAGINA));

  const enviados = c.enviados;
  const reparto = {
    pendientes: c.pendientes, enviado: c.enviados - c.entregados, entregado: c.entregados - c.leidos, leido: c.leidos, fallidos: c.fallidos,
  };
  const urlConv = (conv: number) => `${cw.url.replace(/\/$/, '')}/app/accounts/${cw.cuenta}/conversations/${conv}`;
  const qs = (extra: Record<string, string | number>) => {
    const p = new URLSearchParams(Object.entries({ q: sp.q ?? '', estado: sp.estado ?? '', ...extra }).filter(([, v]) => v !== '' && v !== undefined).map(([k, v]) => [k, String(v)]));
    return p.toString() ? `?${p}` : '';
  };
  const reciente = c.ultimo_envio && Date.now() - new Date(c.ultimo_envio).getTime() < 3 * 86400e3;

  return (
    <>
      <AutoRefresco segundos={c.estado === 'enviando' || c.estado === 'programada' ? 8 : reciente ? 60 : 300} />
      <Link href="/panel/campanas" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Difusiones
      </Link>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">{c.nombre} <EstadoCampanaBadge estado={c.estado} /></h1>
          {c.descripcion && <p className="mt-1 text-sm text-muted-foreground">{c.descripcion}</p>}
        </div>
        <div className="flex flex-wrap gap-2"><AccionesCampana id={c.id} estado={c.estado} fallidos={c.fallidos} /></div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Dato etiqueta="Canal" valor="WhatsApp" />
        <Dato etiqueta="Plantilla" valor={c.plantilla_nombre} />
        <Dato etiqueta="Programada" valor={fmtFechaHora(c.programada_para)} />
        {c.primer_envio && <Dato etiqueta="Primer envío" valor={fmtFechaHora(c.primer_envio)} />}
        {c.ultimo_envio && <Dato etiqueta="Último envío" valor={fmtFechaHora(c.ultimo_envio)} />}
        <Dato etiqueta="Enviados/Total" valor={`${(enviados + c.fallidos).toLocaleString('es-BO')}/${c.total.toLocaleString('es-BO')}`} />
        {c.mapeo.archivo && <Dato etiqueta="Archivo" valor={c.mapeo.archivo} />}
        {c.creador && <Dato etiqueta="Creada por" valor={c.creador} />}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard titulo="Enviados" valor={enviados.toLocaleString('es-BO')} detalle={`de ${c.total.toLocaleString('es-BO')}`} icon={SendIcon} />
        <StatCard titulo="Entregados" valor={pct(c.entregados, enviados)} detalle={`${c.entregados.toLocaleString('es-BO')} de ${enviados.toLocaleString('es-BO')}`} icon={CheckCheckIcon} tono="prueba" />
        <StatCard titulo="Leídos" valor={pct(c.leidos, enviados)} detalle={`${c.leidos.toLocaleString('es-BO')} de ${enviados.toLocaleString('es-BO')}`} icon={BookOpenCheckIcon} tono="pagado" />
        <StatCard titulo="Respondieron" valor={pct(c.respondieron, enviados)} detalle={`${c.respondieron.toLocaleString('es-BO')} contactos`} icon={MessageCircleReplyIcon} tono="pagado" />
        <StatCard titulo="Fallaron" valor={c.fallidos.toLocaleString('es-BO')} detalle={pct(c.fallidos, c.total) + ' del total'} icon={XCircleIcon} tono={c.fallidos ? 'vencido' : 'neutro'} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <CardHeader>
            <CardTitle>Estado de los mensajes</CardTitle>
            <CardDescription>
              {c.estado === 'programada' ? <>Empieza {fmtRelativo(c.programada_para)}.</>
                : c.estado === 'enviando' ? <>Enviando… quedan {c.pendientes.toLocaleString('es-BO')}.</>
                : 'Entregado y leído se actualizan solos durante 3 días.'}
            </CardDescription>
          </CardHeader>
          <CardContent><BarraEstados reparto={reparto} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Mensaje</CardTitle><CardDescription>Con los datos del primer contacto de la lista.</CardDescription></CardHeader>
          <CardContent><VistaPrevia cuerpo={c.plantilla_cuerpo} valores={lista.filas[0]?.parametros ?? {}} /></CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader className="flex-row items-center justify-between gap-2">
          <CardTitle>Contactos</CardTitle>
          <Button variant="outline" size="sm" asChild>
            <a href={`/panel/campanas/${c.id}/exportar${qs({})}`}><DownloadIcon /> Exportar CSV</a>
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4">
          <FiltrosUrl
            pestanas={[
              { v: '', label: 'Todos', n: c.total }, { v: 'leido', label: 'Leídos', n: c.leidos },
              { v: 'entregado', label: 'Entregados', n: c.entregados - c.leidos }, { v: 'enviado', label: 'Sin confirmar', n: c.enviados - c.entregados },
              { v: 'respondio', label: 'Respondieron', n: c.respondieron }, { v: 'fallido', label: 'Fallaron', n: c.fallidos },
              { v: 'pendiente', label: 'Pendientes', n: c.pendientes },
            ]}
            busqueda="Buscar por teléfono, nombre o variable…"
          />
          {lista.filas.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No hay contactos en esta vista.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow className="hover:bg-transparent">
                  <TableHead>Teléfono</TableHead><TableHead>Nombre</TableHead><TableHead>Estado</TableHead>
                  <TableHead>Respuesta</TableHead><TableHead>Última actualización</TableHead><TableHead className="w-0" />
                </TableRow></TableHeader>
                <TableBody>
                  {lista.filas.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="tabular-nums">{fmtTelefono(d.telefono)}</TableCell>
                      <TableCell className="max-w-48 truncate">{d.nombre ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell>
                        <EstadoDestinatario estado={d.estado} respondio={!!d.respondio_el} />
                        {d.error && <span className="block max-w-72 truncate text-xs text-estado-vencido" title={d.error}>{d.error}</span>}
                      </TableCell>
                      <TableCell className="max-w-56 truncate text-sm text-muted-foreground" title={d.respuesta ?? undefined}>{d.respuesta ?? '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground" title={fmtFechaHora(d.actualizado_el)}>{fmtFechaHora(d.actualizado_el)}</TableCell>
                      <TableCell>
                        {d.chatwoot_conversation_id && cw.url && (
                          <a href={urlConv(d.chatwoot_conversation_id)} target="_blank" rel="noopener noreferrer" title="Abrir en Chatwoot"
                            className="inline-flex text-muted-foreground hover:text-primary"><ExternalLinkIcon className="size-4" /></a>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {paginas > 1 && (
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">Página {lista.pagina} de {paginas} · {lista.total.toLocaleString('es-BO')} contactos</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" asChild disabled={pagina <= 1}>
                  <Link aria-disabled={pagina <= 1} className={pagina <= 1 ? 'pointer-events-none opacity-50' : ''} href={`/panel/campanas/${c.id}${qs({ pagina: pagina - 1 })}`}>Anterior</Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link aria-disabled={pagina >= paginas} className={pagina >= paginas ? 'pointer-events-none opacity-50' : ''} href={`/panel/campanas/${c.id}${qs({ pagina: pagina + 1 })}`}>Siguiente</Link>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
