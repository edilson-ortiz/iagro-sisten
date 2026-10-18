import Link from 'next/link';
import {
  AlertTriangleIcon, BadgeCheckIcon, CloudRainIcon, FlaskConicalIcon, HourglassIcon, UsersIcon, WalletIcon,
} from 'lucide-react';
import { requerirSesion } from '@/lib/auth';
import { proximosVencimientos, resumenInicio, serieMensual, ultimasAlertas } from '@/lib/datos';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Encabezado } from '@/components/shell';
import { StatCard } from '@/components/stat-card';
import { GraficoMensual } from '@/components/grafico-mensual';
import { DiasRestantes, EstadoBadge, EstadoMensajeBadge } from '@/components/estado';
import { fmtMonto, fmtRelativo, fmtTelefono } from '@/lib/utils';

export default async function InicioPage() {
  const sesion = await requerirSesion();
  const [r, serie, vencen, alertas] = await Promise.all([resumenInicio(), serieMensual(), proximosVencimientos(), ultimasAlertas()]);
  const conversion = r.total ? Math.round((r.pagado / r.total) * 100) : 0;

  return (
    <>
      <Encabezado titulo={`Hola, ${sesion.nombre.split(' ')[0]} 👋`} descripcion="Resumen del bot de alertas de clima." />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard titulo="Usuarios" valor={r.total} detalle={`${r.nuevos_mes} nuevos este mes`} icon={UsersIcon} href="/panel/usuarios" />
        <StatCard titulo="En prueba" valor={r.prueba} icon={FlaskConicalIcon} tono="prueba" href="/panel/usuarios?estado=prueba" />
        <StatCard titulo="Pagados" valor={r.pagado} detalle={`${conversion}% del total`} icon={BadgeCheckIcon} tono="pagado" href="/panel/usuarios?estado=pagado" />
        <StatCard titulo="Vencidos" valor={r.vencido} icon={AlertTriangleIcon} tono="vencido" href="/panel/usuarios?estado=vencido" />
        <StatCard titulo="Pruebas que vencen" valor={r.pruebas_vencen_semana} detalle="en los próximos 7 días" icon={HourglassIcon} tono="aviso" href="/panel/usuarios?estado=por_vencer" />
        <StatCard titulo="Alertas de lluvia" valor={r.alertas_semana} detalle={`esta semana · ${r.alertas_leidas_semana} leídas`} icon={CloudRainIcon} href="/panel/alertas" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Registros y conversiones por mes</CardTitle>
            <CardDescription>Usuarios nuevos y usuarios que hicieron su primer pago (últimos 12 meses).</CardDescription>
          </CardHeader>
          <CardContent>
            <GraficoMensual datos={serie} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><WalletIcon className="size-4" /> Pagos del mes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">{fmtMonto(r.ingresos_mes)}</p>
            <p className="mt-1 text-sm text-muted-foreground">{r.pagos_mes} pago{r.pagos_mes === 1 ? '' : 's'} registrado{r.pagos_mes === 1 ? '' : 's'}</p>
            <div className="mt-6 border-t pt-4">
              <p className="mb-3 text-sm font-medium">Vencen en los próximos 7 días</p>
              {vencen.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nadie vence esta semana. 🎉</p>
              ) : (
                <ul className="grid gap-2">
                  {vencen.map((u) => (
                    <li key={u.id}>
                      <Link href={`/panel/usuarios/${u.id}`} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 -mx-2 hover:bg-muted">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{u.nombre ?? fmtTelefono(u.telefono)}</span>
                          <EstadoBadge estado={u.estado} />
                        </span>
                        <DiasRestantes dias={u.dias_restantes} estado={u.estado} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Últimas alertas de lluvia</CardTitle>
            <CardDescription className="mt-1">Estado de entrega de las notificaciones automáticas.</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild><Link href="/panel/alertas">Ver todas</Link></Button>
        </CardHeader>
        <CardContent>
          {alertas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Todavía no se envió ninguna alerta de lluvia.</p>
          ) : (
            <ul className="divide-y">
              {alertas.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                  <Link href={`/panel/usuarios/${a.usuario_id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
                    {a.nombre ?? fmtTelefono(a.telefono!)}
                    {a.zona && <span className="font-normal text-muted-foreground"> · {a.zona}</span>}
                  </Link>
                  <span className="text-sm tabular-nums text-muted-foreground">🌧️ {a.probabilidad}%</span>
                  <span className="w-28 text-sm text-muted-foreground">{fmtRelativo(a.enviada_el)}</span>
                  <EstadoMensajeBadge estado={a.estado} respondio={!!a.respondio_el} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
