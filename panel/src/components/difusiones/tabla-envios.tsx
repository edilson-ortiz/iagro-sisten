'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CheckCheckIcon, CheckIcon, ClockIcon, MessageCircleReplyIcon, PauseCircleIcon, XCircleIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { EnvioDetalle } from '@/lib/datos-difusiones';
import { cn, fmtFechaHora, fmtTelefono } from '@/lib/utils';

type Filtro = 'todos' | 'respondieron' | 'sin_respuesta' | 'leidos' | 'no_leidos' | 'errores' | 'pendientes';

const FILTROS: { v: Filtro; label: string; fn: (e: EnvioDetalle) => boolean }[] = [
  { v: 'todos', label: 'Todos', fn: () => true },
  { v: 'respondieron', label: 'Respondieron', fn: (e) => e.respondio },
  { v: 'sin_respuesta', label: 'No respondieron', fn: (e) => e.enviado && !e.respondio && !e.error },
  { v: 'leidos', label: 'Leyeron y no respondieron', fn: (e) => e.leido && !e.respondio },
  { v: 'no_leidos', label: 'No leyeron', fn: (e) => e.enviado && !e.leido && !e.error },
  { v: 'errores', label: 'Con error', fn: (e) => !!e.error },
  { v: 'pendientes', label: 'Pendientes', fn: (e) => !e.enviado && !e.error },
];

/** Estado de un envío en una palabra + icono */
function Estado({ e }: { e: EnvioDetalle }) {
  if (e.error) return <Badge variant="vencido"><XCircleIcon /> Falló</Badge>;
  if (!e.enviado) return <Badge variant="neutro"><ClockIcon /> Pendiente</Badge>;
  if (e.respondio) return <Badge variant="pagado"><MessageCircleReplyIcon /> Respondió</Badge>;
  if (e.leido) return <Badge variant="pagado"><CheckCheckIcon /> Leído</Badge>;
  if (e.entregado) return <Badge variant="prueba"><CheckCheckIcon /> Entregado</Badge>;
  return <Badge variant="neutro"><CheckIcon /> Enviado</Badge>;
}

function Paso({ ok, fecha }: { ok: boolean; fecha: string | null }) {
  return ok
    ? <span className="text-sm tabular-nums" title={fechaCompleta(fecha)}>{fechaCorta(fecha)}</span>
    : <span className="text-muted-foreground">—</span>;
}
const fechaCompleta = (f: string | null) => (f ? fmtFechaHora(f) : '');
const fechaCorta = (f: string | null) => (f ? new Date(f).toLocaleString('es-BO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/La_Paz' }) : '✓');

export function TablaEnvios({ envios }: { envios: EnvioDetalle[] }) {
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [q, setQ] = useState('');
  const conteo = useMemo(() => Object.fromEntries(FILTROS.map((f) => [f.v, envios.filter(f.fn).length])), [envios]);
  const visibles = useMemo(() => {
    const fn = FILTROS.find((f) => f.v === filtro)!.fn;
    const t = q.trim().toLowerCase();
    return envios.filter((e) => fn(e) && (!t || `${e.nombre ?? ''} ${e.telefono} ${e.zona ?? ''}`.toLowerCase().includes(t)));
  }, [envios, filtro, q]);

  return (
    <div className="grid gap-3">
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {FILTROS.filter((f) => f.v === 'todos' || conteo[f.v]).map((f) => (
          <button
            key={f.v}
            onClick={() => setFiltro(f.v)}
            className={cn(
              'flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
              filtro === f.v ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent',
            )}
          >
            {f.label}
            <span className={cn('rounded-full px-1.5 text-xs tabular-nums', filtro === f.v ? 'bg-primary-foreground/20' : 'bg-muted text-muted-foreground')}>{conteo[f.v]}</span>
          </button>
        ))}
      </div>
      <Input placeholder="Buscar destinatario…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar destinatario" className="sm:max-w-xs" />

      {visibles.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nadie en este filtro.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Usuario</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Enviado</TableHead>
              <TableHead>Entregado</TableHead>
              <TableHead>Leído</TableHead>
              <TableHead>Respondió</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibles.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="max-w-60">
                  <Link href={`/panel/usuarios/${e.usuario_id}`} className="block truncate font-medium hover:underline">{e.nombre ?? 'Sin nombre'}</Link>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {fmtTelefono(e.telefono)}
                    {e.difusion_pausada && <span className="inline-flex items-center gap-0.5 text-estado-aviso"><PauseCircleIcon className="size-3" /> pausado</span>}
                  </span>
                </TableCell>
                <TableCell>
                  <Estado e={e} />
                  {e.error && <span className="block max-w-60 truncate text-xs text-estado-vencido" title={e.error}>{e.error}</span>}
                  {e.enviado && !e.respondio && !e.error && e.ventana_cerrada && <span className="block text-xs text-muted-foreground">sin respuesta</span>}
                </TableCell>
                <TableCell><Paso ok={e.enviado} fecha={e.enviado_el} /></TableCell>
                <TableCell><Paso ok={e.entregado} fecha={e.entregado_el} /></TableCell>
                <TableCell><Paso ok={e.leido} fecha={e.leido_el} /></TableCell>
                <TableCell><Paso ok={e.respondio} fecha={e.respondio_el} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
