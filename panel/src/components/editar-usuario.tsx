'use client';

import { useState, useTransition } from 'react';
import { Loader2Icon, PencilIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input, Label, Textarea } from '@/components/ui/input';
import { editarUsuario } from '@/app/panel/(app)/usuarios/actions';

export function EditarUsuario({ usuario }: { usuario: { id: number; nombre: string | null; zona: string | null; notas: string | null; activo: boolean } }) {
  const [abierto, setAbierto] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const [f, setF] = useState({ nombre: usuario.nombre ?? '', zona: usuario.zona ?? '', notas: usuario.notas ?? '', activo: usuario.activo });

  function guardar() {
    iniciar(async () => {
      const r = await editarUsuario({ id: usuario.id, ...f });
      if (r.ok) { toast.success(r.mensaje); setAbierto(false); } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button variant="outline"><PencilIcon /> Editar</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Editar usuario</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="e-nombre">Nombre / propiedad</Label>
            <Input id="e-nombre" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="e-zona">Zona</Label>
            <Input id="e-zona" value={f.zona} placeholder="Ej: San Julián" onChange={(e) => setF({ ...f, zona: e.target.value })} />
            <p className="text-xs text-muted-foreground">Nombre de la zona o comunidad del usuario.</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="e-notas">Notas internas</Label>
            <Textarea id="e-notas" rows={3} value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} />
          </div>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border p-3">
            <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} />
            <span className="text-sm">
              <span className="font-medium">Usuario activo</span>
              <span className="block text-muted-foreground">Si lo desactivas, no recibe alertas.</span>
            </span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setAbierto(false)} disabled={pendiente}>Cancelar</Button>
          <Button onClick={guardar} disabled={pendiente}>{pendiente && <Loader2Icon className="animate-spin" />} Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
