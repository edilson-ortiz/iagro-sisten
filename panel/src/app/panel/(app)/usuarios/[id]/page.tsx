import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeftIcon, CloudSunIcon, ExternalLinkIcon, MapPinIcon, MessageCircleIcon, PhoneIcon, RadarIcon } from 'lucide-react';
import { requerirSesion } from '@/lib/auth';
import {
  alertasDeUsuario, datosChatwoot, difusionesDeUsuario, extrasDeUsuario, hoyLocal, obtenerUsuario, pagosDeUsuario, planesActivos,
} from '@/lib/datos';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DiasRestantes, EstadoBadge, EstadoMensajeBadge } from '@/components/estado';
import { MarcarPagado } from '@/components/marcar-pagado';
import { EditarUsuario } from '@/components/editar-usuario';
import { CambiarUbicacion } from '@/components/usuarios/cambiar-ubicacion';
import { EnlaceChat } from '@/components/usuarios/enlace-chat';
import { rutaChat } from '@/lib/chat-web';
import { Reactivar } from '@/components/difusiones/reactivar';
import { InterruptorAlertas } from '@/components/alertas/interruptor-alertas';
import { motivoDesactivadas } from '@/lib/situacion-alerta';
import { pronosticoDeUsuario } from '@/lib/datos-alertas';
import { consumoDeUsuario } from '@/lib/datos-consumo';
import { textoFalta } from '@/lib/situacion-alerta';
import { MODULOS } from '@/lib/modulos';
import { fmtFecha, fmtFechaHora, fmtMonto, fmtTelefono, iniciales, urlRadar, urlVentusky } from '@/lib/utils';

export const metadata: Metadata = { title: 'Ficha de usuario' };

const ORIGEN: Record<string, string> = {
  pin: 'Pin de WhatsApp', geocoding: 'Nombre de zona', web: 'Registro web', migracion: 'Sistema anterior', panel: 'Panel',
};

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}

function Vacio({ texto }: { texto: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{texto}</p>;
}

export default async function FichaUsuarioPage({ params }: { params: Promise<{ id: string }> }) {
  await requerirSesion();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const u = await obtenerUsuario(id);
  if (!u) notFound();

  const [pagos, alertas, difusiones, planes, hoy, cw, pron, tokens, extras] = await Promise.all([
    pagosDeUsuario(id), alertasDeUsuario(id), MODULOS.difusiones ? difusionesDeUsuario(id) : Promise.resolve([]),
    planesActivos(), hoyLocal(), datosChatwoot(), pronosticoDeUsuario(id), consumoDeUsuario(id), extrasDeUsuario(id),
  ]);
  const falta = textoFalta(pron?.proxima_lluvia ?? null);

  const urlChatwoot = u.chatwoot_contact_id && cw.url
    ? `${cw.url.replace(/\/$/, '')}/app/accounts/${cw.cuenta}/contacts/${u.chatwoot_contact_id}`
    : null;
  const urlMapa = u.latitud != null && u.longitud != null ? `https://www.google.com/maps?q=${u.latitud},${u.longitud}` : null;
  const ventusky = urlVentusky(u.latitud, u.longitud);
  const bloqueado = u.alerta_bloqueada_hasta && new Date(u.alerta_bloqueada_hasta) > new Date();

  return (
    <>
      <Link href="/panel/usuarios" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Usuarios
      </Link>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
            {iniciales(u.nombre)}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{u.nombre ?? 'Sin nombre'}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1 tabular-nums"><PhoneIcon className="size-3.5" />{fmtTelefono(u.telefono)}</span>
              <EstadoBadge estado={u.estado} activo={u.activo} />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <MarcarPagado usuario={u} planes={planes} hoy={hoy} />
          <EditarUsuario usuario={u} />
          <EnlaceChat ruta={rutaChat(u.telefono)} />
          {urlChatwoot ? (
            <Button variant="outline" asChild>
              <a href={urlChatwoot} target="_blank" rel="noopener noreferrer"><MessageCircleIcon /> Chatwoot <ExternalLinkIcon className="size-3" /></a>
            </Button>
          ) : (
            <Button variant="outline" asChild>
              <a href={`https://wa.me/${u.telefono}`} target="_blank" rel="noopener noreferrer"><MessageCircleIcon /> WhatsApp <ExternalLinkIcon className="size-3" /></a>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Suscripción</CardTitle></CardHeader>
          <CardContent className="divide-y">
            <Dato label="Estado"><EstadoBadge estado={u.estado} activo={u.activo} /></Dato>
            <Dato label="Vence el">{fmtFecha(u.vence_el)}</Dato>
            <Dato label="Días restantes"><DiasRestantes dias={u.dias_restantes} estado={u.estado} /></Dato>
            <Dato label="Registrado">{fmtFecha(u.fecha_registro)}</Dato>
            {tokens && (
              <Dato label="Tokens del ciclo">
                <Link href="/panel/consumo" className={tokens.usados >= tokens.limite ? 'text-estado-vencido hover:underline' : 'hover:underline'}>
                  <span className="tabular-nums">{tokens.usados} / {tokens.limite}</span>
                  <span className="font-normal text-muted-foreground"> · quedan {tokens.restantes}</span>
                </Link>
                <span className="block text-xs font-normal text-muted-foreground">Se renuevan el {fmtFecha(tokens.fin)}</span>
              </Dato>
            )}
            <Dato label="Total pagado">{fmtMonto(u.total_pagado)} <span className="font-normal text-muted-foreground">({u.cantidad_pagos})</span></Dato>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle>Ubicación</CardTitle>
            <CambiarUbicacion usuario={{ id: u.id, latitud: u.latitud, longitud: u.longitud }} />
          </CardHeader>
          <CardContent className="divide-y">
            <Dato label="Zona">{u.zona ?? '—'}</Dato>
            <Dato label="Coordenadas">
              {urlMapa ? (
                <a href={urlMapa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline tabular-nums">
                  <MapPinIcon className="size-3.5" />{u.latitud!.toFixed(4)}, {u.longitud!.toFixed(4)}
                </a>
              ) : 'Sin ubicación'}
            </Dato>
            <Dato label="Pronóstico">
              {ventusky ? (
                <a href={ventusky} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                  <CloudSunIcon className="size-3.5" /> Ventusky <ExternalLinkIcon className="size-3" />
                </a>
              ) : '—'}
            </Dato>
            <Dato label="Radar">
              <a href={urlRadar(u.id)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                <RadarIcon className="size-3.5" /> Radar IAGRO <ExternalLinkIcon className="size-3" />
              </a>
            </Dato>
            <Dato label="Origen">{u.ubicacion_origen ? ORIGEN[u.ubicacion_origen] ?? u.ubicacion_origen : '—'}</Dato>
            <Dato label="Contacto Chatwoot">{u.chatwoot_contact_id ? `#${u.chatwoot_contact_id}` : 'Aún no vinculado'}</Dato>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between gap-2">
            <div>
              <CardTitle>Alertas de lluvia</CardTitle>
              {!u.alertas_activas && (
                <p className="mt-1.5 text-sm text-estado-aviso">
                  {motivoDesactivadas(u.alertas_desactivadas_por)}
                  {u.alertas_desactivadas_el && <span className="block text-xs text-muted-foreground">Desde el {fmtFechaHora(u.alertas_desactivadas_el)}</span>}
                </p>
              )}
              {u.alertas_activas && u.alertas_sin_respuesta > 0 && (
                <p className="mt-1.5 text-xs text-muted-foreground">{u.alertas_sin_respuesta} alerta(s) seguida(s) sin responder</p>
              )}
            </div>
            <InterruptorAlertas usuarioId={u.id} activas={u.alertas_activas} />
          </CardHeader>
          <CardContent className="divide-y">
            <Dato label="Próxima lluvia">
              {pron?.proxima_lluvia
                ? <>{fmtFechaHora(pron.proxima_lluvia)} <span className="block text-xs font-normal text-muted-foreground">{pron.probabilidad}% · {falta === 'Ahora' ? 'ahora' : `faltan ${falta}`}</span></>
                : pron ? 'Sin lluvia prevista' : 'Sin pronóstico aún'}
            </Dato>
            <Dato label="Última alerta">{u.ultima_alerta_lluvia ? fmtFechaHora(u.ultima_alerta_lluvia) : 'Nunca'}</Dato>
            <Dato label="Puede recibir otra">
              {!u.vigente ? <span className="text-estado-vencido">No (no vigente)</span>
                : !u.alertas_activas ? <span className="text-estado-aviso">No (desactivadas)</span>
                : bloqueado ? <span className="text-estado-aviso">Desde {fmtFechaHora(u.alerta_bloqueada_hasta)}</span>
                : <span className="text-estado-pagado">Sí</span>}
            </Dato>
            <Dato label="Alertas en los últimos 7 días">{u.alertas_7d}</Dato>
            <Dato label="Último mensaje del usuario">{u.ultimo_mensaje_el ? fmtFechaHora(u.ultimo_mensaje_el) : '—'}</Dato>
            {extras?.alertas_nivel === 'fuertes' && u.alertas_activas && (
              <Dato label="Nivel de alertas"><span className="text-estado-aviso">Solo lluvias fuertes</span></Dato>
            )}
            {extras && (
              <Dato label="Invitaciones">
                <span className="tabular-nums">{extras.amigos} amigo{extras.amigos === 1 ? '' : 's'}</span>
                <span className="block text-xs font-normal text-muted-foreground">
                  Código {extras.codigo_referido ?? '—'}{extras.premios > 0 && ` · ${extras.premios} premio(s)`}
                  {extras.invitado_por_id && <> · lo invitó <Link href={`/panel/usuarios/${extras.invitado_por_id}`} className="underline">{extras.invitado_por ?? `#${extras.invitado_por_id}`}</Link></>}
                </span>
              </Dato>
            )}
            {extras?.de_baja && (
              <Dato label="Difusiones"><span className="text-estado-vencido">Pidió no recibir (escribe ALTA para volver)</span></Dato>
            )}
          </CardContent>
        </Card>
      </div>

      {u.notas && (
        <Card className="mt-4 p-5 text-sm">
          <p className="mb-1 font-medium">Notas</p>
          <p className="whitespace-pre-line text-muted-foreground">{u.notas}</p>
        </Card>
      )}

      <Card className="mt-4">
        <CardHeader><CardTitle>Historial de pagos</CardTitle></CardHeader>
        <CardContent>
          {pagos.length === 0 ? <Vacio texto="Sin pagos registrados." /> : (
            <Table>
              <TableHeader><TableRow className="hover:bg-transparent">
                <TableHead>Fecha</TableHead><TableHead>Plan</TableHead><TableHead className="text-right">Monto</TableHead>
                <TableHead>Días</TableHead><TableHead>Vencimiento</TableHead><TableHead>Registró</TableHead><TableHead>Nota</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {pagos.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{fmtFechaHora(p.fecha)}</TableCell>
                    <TableCell>{p.plan ?? 'Personalizado'}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMonto(p.monto, p.moneda)}</TableCell>
                    <TableCell className="tabular-nums">+{p.dias_agregados}</TableCell>
                    <TableCell className="text-muted-foreground">{fmtFecha(p.vence_anterior)} → <span className="text-foreground">{fmtFecha(p.vence_nuevo)}</span></TableCell>
                    <TableCell>{p.admin ?? '—'}</TableCell>
                    <TableCell className="max-w-56 truncate text-muted-foreground">{p.nota ?? ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className={`mt-4 grid gap-4 ${MODULOS.difusiones ? 'lg:grid-cols-2' : ''}`}>
        <Card>
          <CardHeader><CardTitle>Alertas recibidas</CardTitle></CardHeader>
          <CardContent>
            {alertas.length === 0 ? <Vacio texto="Todavía no recibió alertas." /> : (
              <ul className="divide-y">
                {alertas.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <span>
                      <span className="font-medium">🌧️ {a.probabilidad}%</span>
                      <span className="text-muted-foreground"> · lluvia {fmtFechaHora(a.hora_pronostico)}</span>
                      <span className="block text-xs text-muted-foreground">Enviada {fmtFechaHora(a.enviada_el)}{a.error ? ` · ${a.error}` : ''}</span>
                      {a.respuesta && (
                        <span className={`block text-xs ${a.respuesta.trim().toLowerCase() === 'dejar de recibir' ? 'text-estado-vencido' : 'text-muted-foreground'}`}>↩ Respondió: {a.respuesta}</span>
                      )}
                    </span>
                    <EstadoMensajeBadge estado={a.estado} respondio={!!a.respondio_el} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {MODULOS.difusiones && <Card>
          <CardHeader className="flex-row items-start justify-between gap-2">
            <div>
              <CardTitle>Difusiones</CardTitle>
              {u.difusion_pausada && (
                <p className="mt-1.5 text-sm text-estado-aviso">
                  En pausa: no respondió {u.difusiones_sin_respuesta} difusión(es) seguidas. No recibe difusiones (sí alertas).
                </p>
              )}
            </div>
            {u.difusion_pausada && <Reactivar usuarioId={u.id} />}
          </CardHeader>
          <CardContent>
            {difusiones.length === 0 ? <Vacio texto="No recibió difusiones." /> : (
              <ul className="divide-y">
                {difusiones.map((d) => (
                  <li key={d.difusion_id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <span>
                      <Link href={`/panel/difusiones/${d.difusion_id}`} className="font-medium hover:underline">{d.titulo}</Link>
                      <span className="block text-xs text-muted-foreground">{d.enviado_el ? fmtFechaHora(d.enviado_el) : 'Pendiente'}{d.error ? ` · ${d.error}` : ''}</span>
                    </span>
                    <EstadoMensajeBadge
                      estado={d.error ? 'fallido' : d.leido ? 'leido' : d.entregado ? 'entregado' : 'enviado'}
                      respondio={d.respondio}
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>}
      </div>
    </>
  );
}
