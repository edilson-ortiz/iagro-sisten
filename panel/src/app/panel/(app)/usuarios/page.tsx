import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRightIcon, MapPinIcon, UsersIcon } from 'lucide-react';
import { requerirSesion } from '@/lib/auth';
import { conteoPorEstado, hoyLocal, listarUsuarios, listarZonas, planesActivos } from '@/lib/datos';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Encabezado } from '@/components/shell';
import { FiltrosUsuarios } from '@/components/filtros-usuarios';
import { DiasRestantes, EstadoBadge } from '@/components/estado';
import { MarcarPagado } from '@/components/marcar-pagado';
import { fmtRelativo, fmtTelefono } from '@/lib/utils';
import { motivoDesactivadas } from '@/lib/situacion-alerta';
import { CasillaTodos, CasillaUsuario, SeleccionUsuarios } from '@/components/usuarios/seleccion';

export const metadata: Metadata = { title: 'Usuarios' };

export default async function UsuariosPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requerirSesion();
  const sp = await searchParams;
  const [usuarios, conteos, zonas, planes, hoy] = await Promise.all([
    listarUsuarios({ q: sp.q, estado: sp.estado, zona: sp.zona, orden: sp.orden }),
    conteoPorEstado(),
    listarZonas(),
    planesActivos(),
    hoyLocal(),
  ]);

  return (
    <>
      <Encabezado titulo="Usuarios" descripcion="Suscriptores del bot, su estado y vencimiento." />
      <FiltrosUsuarios conteos={conteos} zonas={zonas} />

      {usuarios.length === 0 ? (
        <Card className="mt-4 flex flex-col items-center gap-2 p-10 text-center">
          <UsersIcon className="size-8 text-muted-foreground" />
          <p className="font-medium">No hay usuarios con esos filtros</p>
          <p className="text-sm text-muted-foreground">Prueba con otra búsqueda o estado.</p>
        </Card>
      ) : (
        <SeleccionUsuarios ids={usuarios.map((u) => u.id)}>
          <p className="mt-4 mb-2 text-sm text-muted-foreground">
            {usuarios.length} usuario{usuarios.length === 1 ? '' : 's'} · marca las casillas para activar o desactivar alertas a varios a la vez
          </p>

          {/* Escritorio: tabla */}
          <Card className="mb-20 hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-0"><CasillaTodos ids={usuarios.map((u) => u.id)} /></TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead>Zona</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Días restantes</TableHead>
                  <TableHead>Última alerta</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usuarios.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell><CasillaUsuario id={u.id} nombre={u.nombre ?? u.telefono} /></TableCell>
                    <TableCell className="max-w-56">
                      <Link href={`/panel/usuarios/${u.id}`} className="block truncate font-medium hover:underline">
                        {u.nombre ?? 'Sin nombre'}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{fmtTelefono(u.telefono)}</TableCell>
                    <TableCell className="max-w-40 truncate">{u.zona ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell><span className="flex items-center gap-1"><EstadoBadge estado={u.estado} activo={u.activo} />{!u.alertas_activas && <Badge variant="aviso" title={motivoDesactivadas(u.alertas_desactivadas_por)}>Sin alertas</Badge>}</span></TableCell>
                    <TableCell><DiasRestantes dias={u.dias_restantes} estado={u.estado} /></TableCell>
                    <TableCell className="text-muted-foreground">{u.ultima_alerta_lluvia ? fmtRelativo(u.ultima_alerta_lluvia) : 'Nunca'}</TableCell>
                    <TableCell className="text-right">
                      <MarcarPagado usuario={u} planes={planes} hoy={hoy} compacto />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* Celular: tarjetas */}
          <div className="grid gap-2 pb-20 md:hidden">
            <label className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
              <CasillaTodos ids={usuarios.map((u) => u.id)} /> Seleccionar todos
            </label>
            {usuarios.map((u) => (
              <Card key={u.id} className="flex items-start gap-3 p-4">
                <span className="pt-1"><CasillaUsuario id={u.id} nombre={u.nombre ?? u.telefono} /></span>
                <div className="min-w-0 flex-1">
                <Link href={`/panel/usuarios/${u.id}`} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{u.nombre ?? 'Sin nombre'}</p>
                    <p className="text-sm tabular-nums text-muted-foreground">{fmtTelefono(u.telefono)}</p>
                    {u.zona && <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground"><MapPinIcon className="size-3" />{u.zona}</p>}
                  </div>
                  <ChevronRightIcon className="mt-1 size-4 shrink-0 text-muted-foreground" />
                </Link>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <EstadoBadge estado={u.estado} activo={u.activo} />
                    {!u.alertas_activas && <Badge variant="aviso">Sin alertas</Badge>}
                    <DiasRestantes dias={u.dias_restantes} estado={u.estado} />
                  </div>
                  <MarcarPagado usuario={u} planes={planes} hoy={hoy} compacto />
                </div>
                </div>
              </Card>
            ))}
          </div>
        </SeleccionUsuarios>
      )}
    </>
  );
}
