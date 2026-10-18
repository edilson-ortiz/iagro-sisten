'use client';

import { useMemo, useState, useTransition } from 'react';
import { BadgeDollarSignIcon, Loader2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Input, Label, NativeSelect, Textarea } from '@/components/ui/input';
import { marcarPagado } from '@/app/panel/(app)/usuarios/actions';
import { fmtFecha, fmtMonto } from '@/lib/utils';

export type PlanOpcion = { id: number; nombre: string; dias: number; monto: number; moneda: string };

/** Calcula el nuevo vencimiento igual que bot_clima.registrar_pago (para la vista previa) */
function calcularVencimiento(venceEl: string, dias: number, hoy: string) {
  const base = venceEl >= hoy ? venceEl : hoy;
  const d = new Date(`${base}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function MarcarPagado({
  usuario, planes, hoy, compacto = false,
}: {
  usuario: { id: number; nombre: string | null; telefono: string; vence_el: string };
  planes: PlanOpcion[];
  hoy: string;
  compacto?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const [planId, setPlanId] = useState<string>(planes[0] ? String(planes[0].id) : '');
  const plan = planes.find((p) => String(p.id) === planId);
  const [monto, setMonto] = useState(plan ? String(plan.monto) : '0');
  const [dias, setDias] = useState(plan ? String(plan.dias) : '30');
  const [nota, setNota] = useState('');

  const nuevoVence = useMemo(() => calcularVencimiento(usuario.vence_el, Number(dias) || 0, hoy), [usuario.vence_el, dias, hoy]);
  const yaVencio = usuario.vence_el < hoy;

  function elegirPlan(id: string) {
    setPlanId(id);
    const p = planes.find((x) => String(x.id) === id);
    if (p) {
      setMonto(String(p.monto));
      setDias(String(p.dias));
    }
  }

  function confirmar() {
    iniciar(async () => {
      const r = await marcarPagado({ usuarioId: usuario.id, planId: planId ? Number(planId) : null, monto, dias, nota });
      if (r.ok) {
        toast.success(r.mensaje);
        setAbierto(false);
        setNota('');
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        {compacto ? (
          <Button size="sm" variant="outline"><BadgeDollarSignIcon /> Pagado +{plan?.dias ?? 30} d</Button>
        ) : (
          <Button><BadgeDollarSignIcon /> Marcar pagado +{plan?.dias ?? 30} días</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar pago</DialogTitle>
          <DialogDescription>
            {usuario.nombre ?? usuario.telefono} · vence el {fmtFecha(usuario.vence_el)}
            {yaVencio ? ' (ya venció: se cuenta desde hoy)' : ' (vigente: se suma desde el vencimiento)'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {planes.length > 0 && (
            <div className="grid gap-2">
              <Label htmlFor="plan">Plan</Label>
              <NativeSelect id="plan" value={planId} onChange={(e) => elegirPlan(e.target.value)}>
                {planes.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre} · {p.dias} días · {fmtMonto(p.monto, p.moneda)}</option>
                ))}
                <option value="">Otro (personalizado)</option>
              </NativeSelect>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="monto">Monto ({plan?.moneda ?? 'BOB'})</Label>
              <Input id="monto" type="number" inputMode="decimal" min={0} step="0.5" value={monto} onChange={(e) => setMonto(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dias">Días a sumar</Label>
              <Input id="dias" type="number" inputMode="numeric" min={1} value={dias} onChange={(e) => setDias(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="nota">Nota (opcional)</Label>
            <Textarea id="nota" rows={2} placeholder="Ej: pagó por QR, comprobante 1234" value={nota} onChange={(e) => setNota(e.target.value)} />
          </div>
          <div className="rounded-lg bg-estado-pagado/10 px-4 py-3 text-sm">
            Nuevo vencimiento: <strong className="text-estado-pagado">{fmtFecha(nuevoVence)}</strong>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setAbierto(false)} disabled={pendiente}>Cancelar</Button>
          <Button onClick={confirmar} disabled={pendiente || !(Number(dias) > 0)}>
            {pendiente && <Loader2Icon className="animate-spin" />}
            Confirmar pago
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
