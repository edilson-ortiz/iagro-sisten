'use client';

import { createContext, use, useEffect, useState, useTransition } from 'react';
import { BellOffIcon, BellRingIcon, Loader2Icon, XIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cambiarAlertasVarios } from '@/app/panel/(app)/alertas/actions';

type Ctx = { sel: Set<number>; alternar: (id: number) => void; poner: (ids: number[], si: boolean) => void; limpiar: () => void };
const Seleccion = createContext<Ctx | null>(null);
const useSel = () => use(Seleccion)!;

/** Selección múltiple de la lista de usuarios: casillas + barra de acciones en lote */
export function SeleccionUsuarios({ ids, children }: { ids: number[]; children: React.ReactNode }) {
  const [sel, setSel] = useState<Set<number>>(new Set());

  // Al cambiar los filtros, se descartan los seleccionados que ya no se ven
  const visibles = ids.join(',');
  useEffect(() => {
    const ok = new Set(ids);
    setSel((s) => new Set([...s].filter((id) => ok.has(id))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibles]);

  const ctx: Ctx = {
    sel,
    alternar: (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }),
    poner: (lista, si) => setSel((s) => { const n = new Set(s); lista.forEach((id) => (si ? n.add(id) : n.delete(id))); return n; }),
    limpiar: () => setSel(new Set()),
  };
  return (
    <Seleccion value={ctx}>
      {children}
      <BarraSeleccion />
    </Seleccion>
  );
}

const claseCasilla = 'size-4 cursor-pointer accent-primary align-middle';

export function CasillaUsuario({ id, nombre }: { id: number; nombre: string }) {
  const { sel, alternar } = useSel();
  return <input type="checkbox" className={claseCasilla} checked={sel.has(id)} onChange={() => alternar(id)} aria-label={`Seleccionar a ${nombre}`} />;
}

export function CasillaTodos({ ids }: { ids: number[] }) {
  const { sel, poner } = useSel();
  const marcados = ids.filter((id) => sel.has(id)).length;
  return (
    <input
      type="checkbox"
      className={claseCasilla}
      aria-label="Seleccionar todos"
      checked={ids.length > 0 && marcados === ids.length}
      ref={(el) => { if (el) el.indeterminate = marcados > 0 && marcados < ids.length; }}
      onChange={() => poner(ids, marcados < ids.length)}
    />
  );
}

function BarraSeleccion() {
  const { sel, limpiar } = useSel();
  const [pendiente, iniciar] = useTransition();
  const [accion, setAccion] = useState<'activar' | 'desactivar' | null>(null);
  if (!sel.size) return null;

  const ejecutar = (activar: boolean) => {
    setAccion(activar ? 'activar' : 'desactivar');
    iniciar(async () => {
      const r = await cambiarAlertasVarios([...sel], activar);
      if (r.ok) { toast.success(r.mensaje); limpiar(); } else toast.error(r.error);
      setAccion(null);
    });
  };

  return (
    <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4" role="region" aria-label="Acciones con los seleccionados">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2 pl-4 shadow-lg">
        <span className="text-sm font-medium tabular-nums">{sel.size} seleccionado{sel.size === 1 ? '' : 's'}</span>
        <Button size="sm" variant="outline" disabled={pendiente} onClick={() => ejecutar(false)}>
          {accion === 'desactivar' ? <Loader2Icon className="animate-spin" /> : <BellOffIcon />} Desactivar alertas
        </Button>
        <Button size="sm" variant="outline" disabled={pendiente} onClick={() => ejecutar(true)}>
          {accion === 'activar' ? <Loader2Icon className="animate-spin" /> : <BellRingIcon />} Activar alertas
        </Button>
        <Button size="icon" variant="ghost" className="size-8" disabled={pendiente} onClick={limpiar} aria-label="Quitar selección">
          <XIcon />
        </Button>
      </div>
    </div>
  );
}
