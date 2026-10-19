'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2Icon, Loader2Icon, TriangleAlertIcon, UserPlusIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input, Label, NativeSelect, Textarea } from '@/components/ui/input';
import type { PlanOpcion } from '@/components/marcar-pagado';
import { crearUsuario } from '@/app/panel/(app)/usuarios/actions';
import { enBolivia, leerCoordenadas, validas } from '@/lib/coordenadas';
import { normalizarTelefono } from '@/lib/campanas/telefono';
import { fmtMonto, fmtTelefono } from '@/lib/utils';

/** Alta manual de un cliente (por ejemplo, alguien que pagó en persona o por teléfono) */
export function NuevoUsuario({ planes, diasPrueba }: { planes: PlanOpcion[]; diasPrueba: number }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const [telefono, setTelefono] = useState('');
  const [nombre, setNombre] = useState('');
  const [zona, setZona] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [notas, setNotas] = useState('');
  const [plan, setPlan] = useState('prueba'); // 'prueba' | id del plan | 'otro'
  const [monto, setMonto] = useState('0');
  const [dias, setDias] = useState('30');

  const tel = telefono.trim() ? normalizarTelefono(telefono) : null;
  const coords = ubicacion.trim() ? leerCoordenadas(ubicacion) : null;
  const coordsOk = !!coords && validas(coords.latitud, coords.longitud);
  const pagado = plan !== 'prueba';
  const valido = !!tel && (!ubicacion.trim() || coordsOk) && (!pagado || Number(dias) > 0);

  function limpiar() {
    setTelefono(''); setNombre(''); setZona(''); setUbicacion(''); setNotas(''); setPlan('prueba');
  }

  function elegirPlan(v: string) {
    setPlan(v);
    const p = planes.find((x) => String(x.id) === v);
    if (p) { setMonto(String(p.monto)); setDias(String(p.dias)); }
  }

  function guardar() {
    iniciar(async () => {
      const r = await crearUsuario({
        telefono, nombre, zona, notas,
        latitud: coordsOk ? coords!.latitud : null, longitud: coordsOk ? coords!.longitud : null,
        pago: pagado ? { planId: plan === 'otro' ? null : Number(plan), monto, dias } : null,
      });
      if (r.ok) {
        toast.success(r.mensaje);
        setAbierto(false);
        limpiar();
        router.push(`/panel/usuarios/${r.id}`);
      } else if (r.existente && r.id) {
        const id = r.id;
        toast.error(r.error, { action: { label: 'Ver ficha', onClick: () => router.push(`/panel/usuarios/${id}`) } });
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button><UserPlusIcon /> Nuevo usuario</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo usuario</DialogTitle>
          <DialogDescription>Recibe el pronóstico y las alertas por WhatsApp igual que si se hubiera registrado solo.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="n-tel">Teléfono (WhatsApp) *</Label>
            <Input id="n-tel" inputMode="tel" autoFocus value={telefono} placeholder="76098116" onChange={(e) => setTelefono(e.target.value)} />
            {telefono.trim() && (tel
              ? <p className="flex items-center gap-1.5 text-xs text-estado-pagado"><CheckCircle2Icon className="size-3.5" /> {fmtTelefono(tel)}</p>
              : <p className="text-xs text-estado-aviso">Escribe el celular (8 dígitos) o el número con código de país.</p>)}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="n-nombre">Nombre</Label>
              <Input id="n-nombre" value={nombre} placeholder="Juan Pérez" onChange={(e) => setNombre(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="n-zona">Zona</Label>
              <Input id="n-zona" value={zona} placeholder="Montero" onChange={(e) => setZona(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="n-ubi">Ubicación del campo</Label>
            <Input id="n-ubi" value={ubicacion} placeholder="-17.3393, -63.2505  o  enlace de Google Maps" onChange={(e) => setUbicacion(e.target.value)} />
            {!ubicacion.trim() ? (
              <p className="text-xs text-muted-foreground">Opcional. Sin ubicación no recibe alertas de lluvia; se puede poner después en su ficha.</p>
            ) : coordsOk ? (
              enBolivia(coords!.latitud, coords!.longitud)
                ? <p className="flex items-center gap-1.5 text-xs text-estado-pagado"><CheckCircle2Icon className="size-3.5" /> {coords!.latitud}, {coords!.longitud}</p>
                : <p className="flex items-center gap-1.5 text-xs text-estado-aviso"><TriangleAlertIcon className="size-3.5" /> Fuera de Bolivia: revisa que latitud y longitud no estén invertidas.</p>
            ) : (
              <p className="text-xs text-estado-aviso">No se encontraron coordenadas. Pega «latitud, longitud» o el enlace largo de Google Maps.</p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="n-plan">Plan inicial</Label>
            <NativeSelect id="n-plan" value={plan} onChange={(e) => elegirPlan(e.target.value)}>
              <option value="prueba">Prueba gratis · {diasPrueba} días</option>
              {planes.map((p) => <option key={p.id} value={p.id}>Pagado: {p.nombre} · {p.dias} días · {fmtMonto(p.monto, p.moneda)}</option>)}
              <option value="otro">Pagado: otro (personalizado)</option>
            </NativeSelect>
          </div>
          {pagado && (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="n-monto">Monto</Label>
                <Input id="n-monto" type="number" inputMode="decimal" min={0} step="0.5" value={monto} onChange={(e) => setMonto(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="n-dias">Días desde hoy</Label>
                <Input id="n-dias" type="number" inputMode="numeric" min={1} value={dias} onChange={(e) => setDias(e.target.value)} />
              </div>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="n-notas">Notas (opcional)</Label>
            <Textarea id="n-notas" rows={2} value={notas} placeholder="Ej: lo registró el técnico en la feria" onChange={(e) => setNotas(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setAbierto(false)} disabled={pendiente}>Cancelar</Button>
          <Button onClick={guardar} disabled={pendiente || !valido}>{pendiente && <Loader2Icon className="animate-spin" />} Crear usuario</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
