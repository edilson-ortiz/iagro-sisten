import type { Metadata } from 'next';
import Link from 'next/link';
import {
  BellOffIcon, BookOpenCheckIcon, CheckCheckIcon, CloudRainIcon, MapPinOffIcon, MessageCircleReplyIcon, SettingsIcon,
  TimerIcon, TriangleAlertIcon, XCircleIcon, CloudSunIcon, RadarIcon,
} from 'lucide-react';
import { requerirSesion } from '@/lib/auth';
import { estadisticasAlertas, historialAlertas, proximasLluvias, type ProximaFila } from '@/lib/datos-alertas';
import { reglaAlertas } from '@/lib/datos-config';
import { alertaVigente, situacionAlerta, textoFalta, type Situacion } from '@/lib/situacion-alerta';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Encabezado } from '@/components/shell';
import { StatCard } from '@/components/stat-card';
import { FiltrosUrl } from '@/components/filtros-url';
import { EstadoMensajeBadge } from '@/components/estado';
import { ReactivarAlertas } from '@/components/alertas/reactivar-alertas';
import { AutoRefresco } from '@/components/auto-refresco';
import { cn, fmtFechaHora, fmtRelativo, fmtTelefono, urlRadar, urlVentusky, ZONA_HORARIA } from '@/lib/utils';

export const metadata: Metadata = { title: 'Alertas de lluvia' };

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');
const H = 3600e3;

const TONO: Record<Situacion['clave'], string> = {
  enviada: 'text-estado-pagado',
  por_enviar: 'text-primary',
  programada: 'text-foreground',
  en_espera: 'text-estado-aviso',
  desactivado: 'text-estado-aviso',
  sin_lluvia: 'text-muted-foreground',
  sin_pronostico: 'text-muted-foreground',
  sin_ubicacion: 'text-muted-foreground',
  apagadas: 'text-estado-vencido',
};

function lluviaCorta(iso: string) {
  return new Date(iso).toLocaleString('es-BO', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: ZONA_HORARIA });
}

/** Pastilla "faltan X h": más intensa cuanto más cerca */
function Falta({ iso, horas, ahora }: { iso: string | null; horas: number; ahora: number }) {
  const t = textoFalta(iso, ahora);
  if (!t) return <span className="text-muted-foreground">—</span>;
  const h = (new Date(iso!).getTime() - ahora) / H;
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-medium tabular-nums whitespace-nowrap',
      h <= 6 ? 'bg-estado-vencido/10 text-estado-vencido' : h <= horas ? 'bg-estado-aviso/10 text-estado-aviso' : 'bg-muted text-foreground',
    )}>
      <TimerIcon className="size-3.5" />{t === 'Ahora' ? 'Ahora' : `Faltan ${t}`}
    </span>
  );
}

/** Accesos rápidos: Ventusky en sus coordenadas y su radar IAGRO */
function Enlaces({ f }: { f: ProximaFila }) {
  const v = urlVentusky(f.latitud, f.longitud);
  const clase = 'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-primary hover:bg-accent';
  return (
    <span className="mt-0.5 flex flex-wrap gap-1">
      {v && <a href={v} target="_blank" rel="noopener noreferrer" className={clase} title="Ver pronóstico en Ventusky"><CloudSunIcon className="size-3.5" /> Ventusky</a>}
      <a href={urlRadar(f.id)} target="_blank" rel="noopener noreferrer" className={clase} title="Ver radar IAGRO del usuario"><RadarIcon className="size-3.5" /> Radar</a>
    </span>
  );
}

/** Lo que respondió a la alerta (botón de la plantilla o texto) */
function Respuesta({ texto }: { texto: string }) {
  const baja = texto.trim().toLowerCase() === 'dejar de recibir';
  return (
    <span className={cn('mt-1 block max-w-56 truncate text-xs', baja ? 'text-estado-vencido' : 'text-muted-foreground')} title={texto}>
      ↩ {texto}
    </span>
  );
}

function Lluvia({ f }: { f: ProximaFila }) {
  if (!f.proxima_lluvia) return <span className="text-muted-foreground">—</span>;
  return (
    <span>
      <span className="block font-medium first-letter:uppercase">{lluviaCorta(f.proxima_lluvia)}</span>
      <span className="text-xs text-muted-foreground tabular-nums">🌧️ {f.probabilidad}%{f.mm ? ` · ${f.mm} mm` : ''}</span>
    </span>
  );
}

function Alerta({ f, s, ahora }: { f: ProximaFila; s: Situacion; ahora: number }) {
  return (
    <span className="grid gap-1">
      <span className={cn('flex flex-wrap items-center gap-2 text-sm font-medium', TONO[s.clave])}>
        {s.texto}
        {alertaVigente(f, ahora) && f.alerta_estado && (
          <EstadoMensajeBadge estado={f.alerta_estado} respondio={!!f.alerta_respondio_el} />
        )}
      </span>
      {s.detalle && <span className="max-w-72 break-words text-xs text-muted-foreground first-letter:uppercase">{s.detalle}</span>}
    </span>
  );
}

export default async function AlertasPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requerirSesion();
  const sp = await searchParams;
  const dias = [1, 7, 30, 90, 365].includes(Number(sp.dias)) ? Number(sp.dias) : 30;
  const [regla, st, historial, filas] = await Promise.all([
    reglaAlertas(), estadisticasAlertas(dias), historialAlertas({ estado: sp.estado, dias: String(dias) }), proximasLluvias(),
  ]);
  const ahora = Date.now();

  const conSituacion = filas.map((f) => ({ f, s: situacionAlerta(f, regla, ahora) }));
  const pronto = (f: ProximaFila) => !!f.proxima_lluvia && new Date(f.proxima_lluvia).getTime() - ahora <= regla.horas * H
    && new Date(f.proxima_lluvia).getTime() > ahora - H;
  const VISTAS: Record<string, (x: (typeof conSituacion)[number]) => boolean> = {
    '': () => true,
    pronto: (x) => pronto(x.f),
    enviada: (x) => alertaVigente(x.f, ahora),
    desactivado: (x) => !x.f.alertas_activas,
    sin_lluvia: (x) => !x.f.proxima_lluvia,
  };
  const vista = sp.vista && VISTAS[sp.vista] ? sp.vista : '';
  const q = sp.q?.trim().toLowerCase();
  const visibles = conSituacion
    .filter(VISTAS[vista]!)
    .filter(({ f }) => !q || [f.nombre, f.telefono, f.zona].some((v) => v?.toLowerCase().includes(q)));
  const n = (k: string) => conSituacion.filter(VISTAS[k]!).length;

  const ultimaConsulta = filas.reduce<string | null>((m, f) => (f.consultado_el && (!m || f.consultado_el > m) ? f.consultado_el : m), null);
  const desactualizado = ultimaConsulta && ahora - new Date(ultimaConsulta).getTime() > 2 * H;
  const sinUbicacion = filas.filter((f) => !f.tiene_ubicacion).length;

  return (
    <>
      <AutoRefresco />
      <Encabezado titulo="Alertas de lluvia" descripcion="Próxima lluvia de cada usuario, cuánto falta y si ya se le avisó.">
        <Button variant="outline" asChild><Link href="/panel/configuracion#lluvia"><SettingsIcon /> Cambiar la regla</Link></Button>
      </Encabezado>

      <Card className="mb-4 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${regla.activa ? 'bg-primary/10 text-primary' : 'bg-estado-vencido/10 text-estado-vencido'}`}>
            <CloudRainIcon className="size-5" />
          </span>
          <p className="text-sm leading-relaxed">
            {regla.activa ? (
              <>
                <strong>Activas.</strong> Cada hora se revisa el pronóstico de cada usuario. Cuando su próxima lluvia (más de <strong>{regla.umbral}%</strong>
                {regla.mm_minimo > 0 && <> y {regla.mm_minimo} mm</>}) está a <strong>{regla.horas} h o menos</strong>, se le avisa ({regla.desde}–{regla.hasta}).
                Máximo <strong>{regla.max_semana} por semana</strong>{regla.max_semana > 1 && <>, {regla.horas_entre} h entre alertas</>}.
                {regla.pausar_sin_leer > 0 && <> Quien no responde <strong>{regla.pausar_sin_leer} alertas seguidas</strong> o toca <em>Dejar de recibir</em> deja de recibirlas.</>}
              </>
            ) : (
              <><strong className="text-estado-vencido">Apagadas.</strong> No se envían alertas automáticas (el pronóstico se sigue mostrando).</>
            )}
          </p>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t pt-3 text-sm text-muted-foreground">
          <span><strong className="text-foreground tabular-nums">{n('pronto')}</strong> con lluvia en las próximas {regla.horas} h</span>
          <span><strong className="text-foreground tabular-nums">{n('enviada')}</strong> ya avisados</span>
          <span className={n('desactivado') ? 'text-estado-aviso' : ''}><BellOffIcon className="mr-1 inline size-3.5" /><strong className="tabular-nums">{n('desactivado')}</strong> con alertas desactivadas</span>
          {sinUbicacion > 0 && (
            <span className="text-estado-aviso"><MapPinOffIcon className="mr-1 inline size-3.5" /><strong className="tabular-nums">{sinUbicacion}</strong> sin ubicación</span>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Próxima lluvia por usuario</CardTitle>
          <CardDescription>
            {ultimaConsulta
              ? <>Pronóstico consultado {fmtRelativo(ultimaConsulta)}. Se actualiza cada hora; esta página se refresca sola.</>
              : <>Todavía no hay pronósticos guardados: los carga el flujo <strong>IAGRO · Alerta de lluvia</strong> de n8n en su próxima ejecución.</>}
          </CardDescription>
          {desactualizado && (
            <p className="mt-2 flex items-center gap-2 rounded-lg bg-estado-aviso/10 px-3 py-2 text-sm text-estado-aviso">
              <TriangleAlertIcon className="size-4 shrink-0" /> El pronóstico tiene más de 2 horas. Revisa que el flujo de n8n esté activo.
            </p>
          )}
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4">
          <FiltrosUrl
            param="vista"
            pestanas={[
              { v: '', label: 'Todos', n: n('') }, { v: 'pronto', label: `Lluvia en ${regla.horas} h`, n: n('pronto') },
              { v: 'enviada', label: 'Avisados', n: n('enviada') }, { v: 'desactivado', label: 'Desactivadas', n: n('desactivado') },
              { v: 'sin_lluvia', label: 'Sin lluvia', n: n('sin_lluvia') },
            ]}
            busqueda="Buscar por nombre, teléfono o zona…"
          />
          {visibles.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No hay usuarios en esta vista.</p>
          ) : (
            <>
              {/* Escritorio */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader><TableRow className="hover:bg-transparent">
                    <TableHead>Usuario</TableHead><TableHead>Próxima lluvia</TableHead><TableHead>Falta</TableHead>
                    <TableHead>Alerta</TableHead><TableHead className="w-0" />
                  </TableRow></TableHeader>
                  <TableBody>
                    {visibles.map(({ f, s }) => (
                      <TableRow key={f.id}>
                        <TableCell className="max-w-56">
                          <Link href={`/panel/usuarios/${f.id}`} className="block truncate font-medium hover:underline">{f.nombre ?? fmtTelefono(f.telefono)}</Link>
                          <span className="text-xs text-muted-foreground">{f.zona ?? fmtTelefono(f.telefono)}</span>
                          <Enlaces f={f} />
                        </TableCell>
                        <TableCell><Lluvia f={f} /></TableCell>
                        <TableCell><Falta iso={f.proxima_lluvia} horas={regla.horas} ahora={ahora} /></TableCell>
                        <TableCell><Alerta f={f} s={s} ahora={ahora} /></TableCell>
                        <TableCell>{!f.alertas_activas && <ReactivarAlertas usuarioId={f.id} />}</TableCell>
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
                        <span className="text-xs text-muted-foreground">{f.zona ?? fmtTelefono(f.telefono)}</span>
                      </Link>
                      <Falta iso={f.proxima_lluvia} horas={regla.horas} ahora={ahora} />
                    </div>
                    {f.proxima_lluvia && <div className="text-sm"><Lluvia f={f} /></div>}
                    <Enlaces f={f} />
                    <Alerta f={f} s={s} ahora={ahora} />
                    {!f.alertas_activas && <div><ReactivarAlertas usuarioId={f.id} texto="Reactivar alertas" /></div>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      <h2 className="mt-8 mb-3 text-lg font-semibold tracking-tight">Alertas enviadas</h2>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard titulo="Enviadas" valor={st.total} detalle={`a ${st.usuarios} usuarios`} icon={CloudRainIcon} />
        <StatCard titulo="Entregadas" valor={pct(st.entregadas, st.total)} detalle={`${st.entregadas} de ${st.total}`} icon={CheckCheckIcon} tono="prueba" />
        <StatCard titulo="Leídas" valor={pct(st.leidas, st.total)} detalle={`${st.leidas} de ${st.total}`} icon={BookOpenCheckIcon} tono="pagado" />
        <StatCard
          titulo="Respondieron" valor={pct(st.respondidas, st.total)} icon={MessageCircleReplyIcon} tono="pagado"
          detalle={`${st.respondidas} de ${st.total}${st.bajas ? ` · ${st.bajas} dejaron de recibir` : ''}`}
        />
        <StatCard titulo="Fallaron" valor={st.fallidas} icon={XCircleIcon} tono={st.fallidas ? 'vencido' : 'neutro'} />
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Historial</CardTitle>
          <CardDescription>Entregado y leído se actualizan cada 10 minutos desde Chatwoot.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4">
          <FiltrosUrl
            pestanas={[
              { v: '', label: 'Todas' }, { v: 'leido', label: 'Leídas' }, { v: 'entregado', label: 'Entregadas' },
              { v: 'enviado', label: 'Sin confirmar' }, { v: 'respondio', label: 'Respondieron' }, { v: 'fallido', label: 'Fallaron' },
            ]}
            selects={[{ param: 'dias', label: 'Periodo', defecto: '30', opciones: [
              { v: '1', label: 'Últimas 24 horas' }, { v: '7', label: 'Últimos 7 días' }, { v: '30', label: 'Últimos 30 días' },
              { v: '90', label: 'Últimos 90 días' }, { v: '365', label: 'Último año' }] }]}
          />
          {historial.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No hay alertas en este periodo.</p>
          ) : (
            <Table>
              <TableHeader><TableRow className="hover:bg-transparent">
                <TableHead>Usuario</TableHead><TableHead className="text-right">Prob.</TableHead><TableHead>Lluvia prevista</TableHead>
                <TableHead>Enviada</TableHead><TableHead>Estado</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {historial.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="max-w-56">
                      <Link href={`/panel/usuarios/${a.usuario_id}`} className="block truncate font-medium hover:underline">{a.nombre ?? fmtTelefono(a.telefono!)}</Link>
                      <span className="text-xs text-muted-foreground">{a.zona ?? fmtTelefono(a.telefono!)}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{a.probabilidad}%</TableCell>
                    <TableCell>{fmtFechaHora(a.hora_pronostico)}</TableCell>
                    <TableCell title={fmtFechaHora(a.enviada_el)}>{fmtRelativo(a.enviada_el)}</TableCell>
                    <TableCell>
                      <EstadoMensajeBadge estado={a.estado} respondio={!!a.respondio_el} />
                      {a.respuesta && <Respuesta texto={a.respuesta} />}
                      {a.error && <span className="block max-w-56 truncate text-xs text-estado-vencido" title={a.error}>{a.error}</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
