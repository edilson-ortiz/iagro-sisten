'use client';

import { useState, useTransition } from 'react';
import { Loader2Icon, PencilIcon, PlusIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { guardarPlan } from '@/app/panel/(app)/configuracion/actions';
import type { PlanFila } from '@/lib/datos-config';
import { fmtMonto } from '@/lib/utils';

type Form = { id?: number; nombre: string; descripcion: string; dias: string; monto: string; moneda: string; activo: boolean; orden: string; tokens_mes: string };
const vacio: Form = { nombre: '', descripcion: '', dias: '30', monto: '0', moneda: 'BOB', activo: true, orden: '0', tokens_mes: '' };

export function Planes({ planes }: { planes: PlanFila[] }) {
  const [form, setForm] = useState<Form | null>(null);
  const [pendiente, iniciar] = useTransition();

  function guardar() {
    if (!form) return;
    iniciar(async () => {
      const r = await guardarPlan({ ...form, dias: form.dias, monto: form.monto, orden: form.orden });
      if (r.ok) { toast.success(r.mensaje); setForm(null); } else toast.error(r.error);
    });
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {planes.map((p) => (
          <div key={p.id} className="flex flex-col gap-2 rounded-xl border p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{p.nombre}</p>
                {p.descripcion && <p className="text-xs text-muted-foreground">{p.descripcion}</p>}
              </div>
              {!p.activo && <Badge variant="neutro">Inactivo</Badge>}
            </div>
            <p className="text-2xl font-semibold tabular-nums">{fmtMonto(p.monto, p.moneda)}</p>
            <p className="text-sm text-muted-foreground">{p.tokens_mes != null ? `${p.tokens_mes} tokens/mes` : 'Tokens: límite general'}</p>
            <p className="text-sm text-muted-foreground">{p.dias} días · {p.pagos} pago{p.pagos === 1 ? '' : 's'} registrado{p.pagos === 1 ? '' : 's'}</p>
            <Button variant="outline" size="sm" className="mt-auto self-start" onClick={() => setForm({
              id: p.id, nombre: p.nombre, descripcion: p.descripcion ?? '', dias: String(p.dias), monto: String(p.monto),
              moneda: p.moneda, activo: p.activo, orden: String(p.orden), tokens_mes: p.tokens_mes != null ? String(p.tokens_mes) : '',
            })}>
              <PencilIcon /> Editar
            </Button>
          </div>
        ))}
        <button
          onClick={() => setForm({ ...vacio, orden: String(planes.length + 1) })}
          className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <PlusIcon className="size-5" /> Nuevo plan
        </button>
      </div>
      {planes.some((p) => p.monto === 0 && p.activo) && (
        <p className="text-sm text-estado-aviso">⚠️ Hay planes con monto 0. Edítalos para poner el precio real.</p>
      )}

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form?.id ? 'Editar plan' : 'Nuevo plan'}</DialogTitle></DialogHeader>
          {form && (
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="p-nombre">Nombre</Label>
                <Input id="p-nombre" value={form.nombre} placeholder="Ej: Mensual, Trimestral" onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="p-desc">Descripción (opcional)</Label>
                <Input id="p-desc" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="p-dias">Días</Label>
                  <Input id="p-dias" type="number" min={1} value={form.dias} onChange={(e) => setForm({ ...form, dias: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="p-monto">Monto</Label>
                  <Input id="p-monto" type="number" min={0} step="0.5" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="p-moneda">Moneda</Label>
                  <Input id="p-moneda" maxLength={3} value={form.moneda} onChange={(e) => setForm({ ...form, moneda: e.target.value.toUpperCase() })} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="p-tokens">Tokens por mes (mensajes salientes)</Label>
                <Input id="p-tokens" type="number" min={0} className="max-w-40" placeholder="General" value={form.tokens_mes} onChange={(e) => setForm({ ...form, tokens_mes: e.target.value })} />
                <p className="text-xs text-muted-foreground">Vacío = usa el límite general de Configuración → Suscripción. No se acumulan entre meses.</p>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Plan activo</p>
                  <p className="text-xs text-muted-foreground">Los inactivos no aparecen al marcar un pago.</p>
                </div>
                <Switch checked={form.activo} onChange={(v) => setForm({ ...form, activo: v })} label="Plan activo" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)} disabled={pendiente}>Cancelar</Button>
            <Button onClick={guardar} disabled={pendiente}>{pendiente && <Loader2Icon className="animate-spin" />} Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
