import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarClockIcon, CoinsIcon, FileTextIcon, SettingsIcon, TriangleAlertIcon, UsersIcon, XCircleIcon } from 'lucide-react';
import { requerirSesion } from '@/lib/auth';
import { consumoCiclo, consumoMensual, mesesConsumo, ultimaSincronizacion, type ConsumoFila } from '@/lib/datos-consumo';
import { hoyLocal } from '@/lib/datos';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Encabezado } from '@/components/shell';
import { StatCard } from '@/components/stat-card';
import { FiltrosUrl } from '@/components/filtros-url';
import { Sincronizar } from '@/components/consumo/sincronizar';
import { cn, fmtFechaHora, fmtRelativo, fmtTelefono } from '@/lib/utils';

export const metadata: Metadata = { title: 'Consumo de mensajes' };

const POR_AGOTAR = 0.8;

const nombreMes = (mes: string) =>
  new Date(`${mes}-15T12:00:00`).toLocaleDateString('es-BO', { month: 'long', year: 'numeric' });

const DIA = 86400e3;
const fechaCorta = (iso: string, dias = 0) =>
  new Date(new Date(`${iso}T12:00:00Z`).getTime() + dias * DIA).toLocaleDateString('es-BO', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const diasEntre = (desde: string, hasta: string) => Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / DIA);

/** "10 oct → 9 nov" y cuándo se renuevan los tokens */
function Ciclo({ f, hoy }: { f: ConsumoFila; hoy: string }) {
  if (!f.inicio || !f.fin) return <span className="text-muted-foreground">—</span>;
  const faltan = diasEntre(hoy, f.fin);
  return (
    <span className="grid text-sm">
      <span className="whitespace-nowrap">{fechaCorta(f.inicio)} → {fechaCorta(f.fin, -1)}</span>
      <span className={cn('text-xs', faltan <= 3 ? 'text-primary' : 'text-muted-foreground')}>
        Renueva {faltan <= 1 ? 'mañana' : `en ${faltan} días`} ({fechaCorta(f.fin)})
      </span>
      {f.estado === 'vencido' && <span className="text-xs text-estado-vencido">Suscripción vencida</span>}
    </span>
  );
}

function situacion(f: ConsumoFila) {
  if (f.limite > 0 && f.usados > f.limite) return { v: 'excedido', label: `Excedido +${f.usados - f.limite}`, badge: 'vencido' as const };
  if (f.limite > 0 && f.usados === f.limite) return { v: 'excedido', label: 'Agotado', badge: 'vencido' as const };
  if (f.limite > 0 && f.usados >= f.limite * POR_AGOTAR) return { v: 'por_agotar', label: 'Por agotar', badge: 'aviso' as const };
  if (f.usados === 0) return { v: 'sin_uso', label: 'Sin uso', badge: 'neutro' as const };
  return { v: 'ok', label: 'Disponible', badge: 'pagado' as const };
}

function Barra({ f }: { f: ConsumoFila }) {
  const pct = f.limite > 0 ? Math.min(100, Math.round((f.usados / f.limite) * 100)) : 0;
  const s = situacion(f).v;
  return (
    <div className="grid min-w-36 gap-1">
      <span className="text-sm tabular-nums">
        <strong>{f.usados}</strong> <span className="text-muted-foreground">/ {f.limite}</span>
      </span>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Tokens usados">
        <div
          className={cn('h-full rounded-full', s === 'excedido' ? 'bg-estado-vencido' : s === 'por_agotar' ? 'bg-estado-aviso' : 'bg-estado-pagado')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default async function ConsumoPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requerirSesion();
  const sp = await searchParams;
  const porMes = sp.vista === 'mes';
  const [meses, hoy] = await Promise.all([mesesConsumo(), hoyLocal()]);
  const mes = sp.mes && meses.includes(sp.mes) ? sp.mes : meses[0]!;
  const [filas, sync] = await Promise.all([
    porMes ? consumoMensual(mes) : consumoCiclo(),
    ultimaSincronizacion(porMes ? mes : undefined),
  ]);
  const sinToken = !process.env.CHATWOOT_API_TOKEN?.trim();

  // Por mes es solo analítica (cantidad de mensajes); el límite se valida únicamente en el ciclo de cada usuario
  const conSituacion = filas.map((f) => ({
    f, s: porMes ? (f.usados ? { v: 'con_uso', label: '', badge: 'neutro' as const } : { v: 'sin_uso', label: '', badge: 'neutro' as const }) : situacion(f),
  }));
  const n = (v: string) => (v ? conSituacion.filter((x) => x.s.v === v).length : conSituacion.length);
  const pestanas = porMes
    ? [{ v: '', label: 'Todos' }, { v: 'con_uso', label: 'Con mensajes' }, { v: 'sin_uso', label: 'Sin mensajes' }]
    : [{ v: '', label: 'Todos' }, { v: 'excedido', label: 'Excedidos' }, { v: 'por_agotar', label: 'Por agotar' },
       { v: 'ok', label: 'Disponible' }, { v: 'sin_uso', label: 'Sin uso' }];
  const vista = pestanas.some((t) => t.v && t.v === sp.estado) ? sp.estado! : '';
  const q = sp.q?.trim().toLowerCase();
  const visibles = conSituacion
    .filter((x) => !vista || x.s.v === vista)
    .filter(({ f }) => !q || [f.nombre, f.telefono, f.zona].some((v) => v?.toLowerCase().includes(q)));

  const total = filas.reduce((a, f) => a + f.usados, 0);
  const plantillas = filas.reduce((a, f) => a + f.plantillas, 0);
  const fallidos = filas.reduce((a, f) => a + f.fallidos, 0);
  const renuevanSemana = filas.filter((f) => f.fin && diasEntre(hoy, f.fin) <= 7).length;

  return (
    <>
      <Encabezado
        titulo="Consumo de mensajes"
        descripcion="Cada mensaje saliente de WhatsApp (bot, alertas o Chatwoot) consume 1 token. Cada usuario renueva sus tokens el mismo día del mes en que se registró; lo no usado no se acumula."
      >
        <Button variant="outline" asChild><Link href="/panel/configuracion#suscripcion"><SettingsIcon /> Límite de tokens</Link></Button>
        <Sincronizar mes={mes} deshabilitado={sinToken} />
      </Encabezado>

      {sinToken && (
        <Card className="mb-4 flex items-start gap-3 border-estado-aviso/40 bg-estado-aviso/5 p-5 text-sm">
          <TriangleAlertIcon className="mt-0.5 size-5 shrink-0 text-estado-aviso" />
          <div className="grid gap-1">
            <p className="font-medium">Falta conectar Chatwoot</p>
            <p className="text-muted-foreground">
              En Chatwoot ve a <strong>Perfil → Configuración del perfil → Token de acceso</strong>, cópialo y agrégalo al <code>.env</code> del panel
              como <code>CHATWOOT_API_TOKEN=…</code>. Luego reinicia el panel.
            </p>
          </div>
        </Card>
      )}

      <nav className="mb-4 flex w-fit gap-1 rounded-lg border bg-card p-1 text-sm" aria-label="Vista">
        {[{ v: '', label: 'Ciclo de cada usuario', icon: CalendarClockIcon }, { v: 'mes', label: 'Por mes (analítica)', icon: CoinsIcon }].map((t) => (
          <Link
            key={t.v || 'ciclo'}
            href={t.v ? `/panel/consumo?vista=${t.v}` : '/panel/consumo'}
            aria-current={(t.v === 'mes') === porMes ? 'page' : undefined}
            className={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors',
              (t.v === 'mes') === porMes ? 'bg-primary text-primary-foreground' : 'hover:bg-accent')}
          >
            <t.icon className="size-4" /> {t.label}
          </Link>
        ))}
      </nav>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {porMes
          ? <StatCard titulo="Mensajes salientes" valor={total} detalle={`en ${nombreMes(mes)}`} icon={CoinsIcon} />
          : <StatCard titulo="Renuevan esta semana" valor={renuevanSemana} detalle={`${total} tokens usados en los ciclos actuales`} icon={CalendarClockIcon} />}
        <StatCard titulo="Plantillas" valor={plantillas} detalle="fuera de la ventana de 24 h" icon={FileTextIcon} tono="prueba" />
        {porMes
          ? <StatCard titulo="Usuarios con mensajes" valor={n('con_uso')} detalle={n('con_uso') ? `promedio ${Math.round(total / n('con_uso'))} por usuario` : undefined} icon={UsersIcon} />
          : <StatCard titulo="Excedidos / agotados" valor={n('excedido')} detalle={`${n('por_agotar')} por agotar (≥ ${POR_AGOTAR * 100}%)`} icon={UsersIcon} tono={n('excedido') ? 'vencido' : 'neutro'} />}
        <StatCard titulo="Fallidos" valor={fallidos} detalle="no consumen token" icon={XCircleIcon} tono={fallidos ? 'aviso' : 'neutro'} />
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>
            {porMes ? <>Mensajes por usuario · <span className="capitalize">{nombreMes(mes)}</span></> : 'Ciclo actual de cada usuario'}
          </CardTitle>
          <CardDescription>
            {sync
              ? <>Sincronizado {fmtRelativo(sync.ejecutada_el)} ({fmtFechaHora(sync.ejecutada_el)}){sync.admin ? ` por ${sync.admin}` : ''} · {sync.usuarios} usuarios revisados en {Math.round(sync.duracion_ms / 1000)} s.</>
              : <>{porMes ? 'Este mes todavía no se sincronizó.' : 'Todavía no se sincronizó.'} Presiona <strong>Sincronizar con Chatwoot</strong>.</>}
          </CardDescription>
          {sync && sync.errores.length > 0 && (
            <details className="mt-2 rounded-lg bg-estado-aviso/10 px-3 py-2 text-sm text-estado-aviso">
              <summary className="cursor-pointer">{sync.errores.length} usuario(s) no se pudieron leer</summary>
              <ul className="mt-2 grid gap-1 text-xs">
                {sync.errores.slice(0, 20).map((e) => (
                  <li key={e.usuario_id}><Link href={`/panel/usuarios/${e.usuario_id}`} className="underline">{e.nombre ?? `#${e.usuario_id}`}</Link>: {e.error}</li>
                ))}
              </ul>
            </details>
          )}
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4">
          <FiltrosUrl
            pestanas={pestanas.map((t) => ({ ...t, n: n(t.v) }))}
            busqueda="Buscar por nombre, teléfono o zona…"
            selects={porMes ? [{ param: 'mes', label: 'Mes', defecto: meses[0], opciones: meses.map((m) => ({ v: m, label: nombreMes(m) })) }] : []}
          />
          {visibles.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No hay usuarios en esta vista.</p>
          ) : (
            <>
              {/* Escritorio */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader><TableRow className="hover:bg-transparent">
                    <TableHead>Usuario</TableHead><TableHead>Plan</TableHead>
                    {porMes ? <TableHead className="text-right">Mensajes</TableHead> : <><TableHead>Ciclo</TableHead><TableHead>Tokens</TableHead></>}
                    <TableHead className="text-right">Plantillas</TableHead>
                    {porMes ? <TableHead className="text-right">Fallidos</TableHead> : <TableHead className="text-right">Quedan</TableHead>}
                    <TableHead>Último envío</TableHead>{!porMes && <TableHead>Estado</TableHead>}
                  </TableRow></TableHeader>
                  <TableBody>
                    {visibles.map(({ f, s }) => (
                      <TableRow key={f.id}>
                        <TableCell className="max-w-56">
                          <Link href={`/panel/usuarios/${f.id}`} className="block truncate font-medium hover:underline">{f.nombre ?? fmtTelefono(f.telefono)}</Link>
                          <span className="text-xs text-muted-foreground">{f.zona ?? fmtTelefono(f.telefono)}</span>
                        </TableCell>
                        <TableCell className="text-sm">{f.plan ?? <span className="text-muted-foreground">{f.estado === 'prueba' ? 'Prueba' : 'Sin plan'}</span>}</TableCell>
                        {porMes
                          ? <TableCell className="text-right font-medium tabular-nums">{f.usados}</TableCell>
                          : <><TableCell><Ciclo f={f} hoy={hoy} /></TableCell><TableCell><Barra f={f} /></TableCell></>}
                        <TableCell className="text-right tabular-nums">{f.plantillas}</TableCell>
                        {porMes
                          ? <TableCell className="text-right tabular-nums text-muted-foreground">{f.fallidos}</TableCell>
                          : <TableCell className={cn('text-right tabular-nums', f.usados >= f.limite && 'text-estado-vencido')}>{Math.max(0, f.limite - f.usados)}</TableCell>}
                        <TableCell className="text-sm text-muted-foreground" title={fmtFechaHora(f.ultimo_envio)}>{f.ultimo_envio ? fmtRelativo(f.ultimo_envio) : '—'}</TableCell>
                        {!porMes && <TableCell><Badge variant={s.badge}>{s.label}</Badge></TableCell>}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {/* Móvil */}
              <ul className="grid grid-cols-1 gap-2 md:hidden">
                {visibles.map(({ f, s }) => (
                  <li key={f.id} className="grid min-w-0 grid-cols-1 gap-2 rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/panel/usuarios/${f.id}`} className="min-w-0">
                        <span className="block truncate font-medium">{f.nombre ?? fmtTelefono(f.telefono)}</span>
                        <span className="text-xs text-muted-foreground">{f.plan ?? (f.estado === 'prueba' ? 'Prueba' : 'Sin plan')}</span>
                      </Link>
                      {porMes
                        ? <span className="text-lg font-semibold tabular-nums">{f.usados}</span>
                        : <Badge variant={s.badge}>{s.label}</Badge>}
                    </div>
                    {!porMes && <><Ciclo f={f} hoy={hoy} /><Barra f={f} /></>}
                    <span className="text-xs text-muted-foreground">
                      {f.plantillas} plantilla(s){porMes ? ` · ${f.fallidos} fallido(s)` : ` · quedan ${Math.max(0, f.limite - f.usados)}`}
                      {f.ultimo_envio ? ` · último ${fmtRelativo(f.ultimo_envio)}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
