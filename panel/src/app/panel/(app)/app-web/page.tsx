import type { Metadata } from 'next';
import Link from 'next/link';
import {
  BellRingIcon, ExternalLinkIcon, HistoryIcon, MegaphoneIcon, MessagesSquareIcon, MonitorIcon, SmartphoneIcon, UsersIcon,
} from 'lucide-react';
import { requerirSesion } from '@/lib/auth';
import {
  contarDestinatarios, historialDifusionesPush, listarAppWeb, resumenAppWeb, type FiltroAppWeb,
} from '@/lib/datos-app-web';
import { rutaChat } from '@/lib/chat-web';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Encabezado } from '@/components/shell';
import { StatCard } from '@/components/stat-card';
import { FiltrosUrl } from '@/components/filtros-url';
import { FormDifusionPush } from '@/components/app-web/form-difusion-push';
import { fmtFecha, fmtFechaHora, fmtRelativo, fmtTelefono } from '@/lib/utils';

export const metadata: Metadata = { title: 'App y notificaciones' };

const PLATAFORMA: Record<string, string> = { android: 'Android', ios: 'iPhone', pc: 'Computadora' };
const SEGMENTO: Record<string, string> = { avisos: 'Con notificaciones', instalada: 'App instalada', numero: 'Un número' };

export default async function AppWebPage({ searchParams }: { searchParams: Promise<{ ver?: string; q?: string }> }) {
  await requerirSesion();
  const { ver, q } = await searchParams;
  const filtro: FiltroAppWeb = ver === 'instalada' || ver === 'avisos' ? ver : 'todos';
  const [resumen, filas, destinatarios, historial] = await Promise.all([
    resumenAppWeb(), listarAppWeb(filtro, q ?? ''), contarDestinatarios(), historialDifusionesPush(),
  ]);

  return (
    <>
      <Encabezado
        titulo="App y notificaciones"
        descripcion="Clientes que usan el chat web: quién instaló la app, quién activó las notificaciones y difusiones por notificación."
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard titulo="Abrieron el chat" valor={resumen.personas} detalle={`${resumen.activos_7d} en los últimos 7 días`} icon={UsersIcon} />
        <StatCard titulo="Instalaron la app" valor={resumen.instaladas} icon={SmartphoneIcon} tono="pagado" href="/panel/app-web?ver=instalada" />
        <StatCard titulo="Con notificaciones" valor={resumen.con_avisos} detalle={`${resumen.dispositivos} dispositivo(s)`} icon={BellRingIcon} tono="prueba" href="/panel/app-web?ver=avisos" />
        <StatCard titulo="Difusiones enviadas" valor={resumen.difusiones} icon={MegaphoneIcon} tono="aviso" />
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MegaphoneIcon className="size-4" /> Enviar notificación</CardTitle>
          <CardDescription>
            Llega como notificación del celular o la computadora a quienes la activaron, aunque tengan el chat cerrado. Es gratis: no pasa por WhatsApp.
          </CardDescription>
        </CardHeader>
        <CardContent><FormDifusionPush destinatarios={destinatarios} /></CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><UsersIcon className="size-4" /> Personas</CardTitle>
          <CardDescription>Se registra cada vez que alguien abre su enlace del chat web.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <FiltrosUrl
            param="ver"
            pestanas={[
              { v: '', label: 'Todos', n: resumen.personas },
              { v: 'instalada', label: 'Instalaron la app', n: resumen.instaladas },
              { v: 'avisos', label: 'Con notificaciones', n: resumen.con_avisos },
            ]}
            busqueda="Buscar por nombre o teléfono…"
          />
          {filas.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {resumen.personas === 0 ? 'Todavía nadie abrió el chat web. Copia el enlace de un cliente desde su ficha → Chat web.' : 'No hay personas en esta vista.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Persona</TableHead>
                    <TableHead>Equipo</TableHead>
                    <TableHead>App</TableHead>
                    <TableHead>Notificaciones</TableHead>
                    <TableHead>Última visita</TableHead>
                    <TableHead className="text-right">Visitas</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filas.map((f) => (
                    <TableRow key={f.telefono}>
                      <TableCell>
                        {f.usuario_id ? (
                          <Link href={`/panel/usuarios/${f.usuario_id}`} className="font-medium hover:underline">{f.nombre ?? 'Sin nombre'}</Link>
                        ) : (
                          <span className="text-muted-foreground">No registrado</span>
                        )}
                        <span className="block text-xs tabular-nums text-muted-foreground">{fmtTelefono(f.telefono)}</span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          {f.plataforma === 'pc' ? <MonitorIcon className="size-3.5" /> : <SmartphoneIcon className="size-3.5" />}
                          {f.plataforma ? PLATAFORMA[f.plataforma] : '—'}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {f.instalada_el
                          ? <span className="text-estado-pagado">Instalada <span className="block text-xs text-muted-foreground">{fmtFecha(f.instalada_el)}</span></span>
                          : <span className="text-muted-foreground">No</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {f.dispositivos > 0
                          ? <span className="text-estado-prueba">Activas{f.dispositivos > 1 ? ` (${f.dispositivos})` : ''} <span className="block text-xs text-muted-foreground">desde {fmtFecha(f.avisos_desde)}</span></span>
                          : <span className="text-muted-foreground">No</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap" title={fmtFechaHora(f.ultima_visita_el)}>{fmtRelativo(f.ultima_visita_el)}</TableCell>
                      <TableCell className="text-right tabular-nums">{f.visitas}</TableCell>
                      <TableCell className="text-right">
                        <a href={rutaChat(f.telefono)} target="_blank" rel="noopener noreferrer"
                           className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-primary hover:bg-accent" title="Abrir su chat web">
                          <MessagesSquareIcon className="size-3.5" /> Chat <ExternalLinkIcon className="size-3" />
                        </a>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><HistoryIcon className="size-4" /> Notificaciones enviadas</CardTitle>
        </CardHeader>
        <CardContent>
          {historial.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Aún no enviaste ninguna.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Mensaje</TableHead>
                    <TableHead>A</TableHead>
                    <TableHead className="text-right">Llegó a</TableHead>
                    <TableHead>Por</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historial.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="whitespace-nowrap">{fmtFechaHora(h.creado_el)}</TableCell>
                      <TableCell className="max-w-md">
                        <span className="font-medium">{h.titulo}</span>
                        <span className="block truncate text-sm text-muted-foreground">{h.texto}</span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{SEGMENTO[h.segmento] ?? h.segmento}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {h.enviados} / {h.destinatarios}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{h.admin ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
