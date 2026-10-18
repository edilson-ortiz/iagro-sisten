'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Loader2Icon, SearchIcon } from 'lucide-react';
import { Input, NativeSelect } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const ESTADOS = [
  { v: '', label: 'Todos', key: 'todos' },
  { v: 'prueba', label: 'En prueba', key: 'prueba' },
  { v: 'pagado', label: 'Pagados', key: 'pagado' },
  { v: 'vencido', label: 'Vencidos', key: 'vencido' },
  { v: 'por_vencer', label: 'Vencen en 7 días', key: 'por_vencer' },
  { v: 'sin_alertas', label: 'Sin alertas', key: 'sin_alertas' },
  { v: 'inactivo', label: 'Inactivos', key: 'inactivo' },
] as const;

export function FiltrosUsuarios({
  conteos, zonas,
}: {
  conteos: Record<(typeof ESTADOS)[number]['key'], number>;
  zonas: { zona: string; n: number }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pendiente, iniciar] = useTransition();
  const [texto, setTexto] = useState(params.get('q') ?? '');

  function actualizar(cambios: Record<string, string>) {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(cambios)) {
      if (v) p.set(k, v); else p.delete(k);
    }
    iniciar(() => router.replace(`${pathname}?${p.toString()}`, { scroll: false }));
  }

  // Búsqueda con pequeña espera mientras se escribe
  useEffect(() => {
    if (texto === (params.get('q') ?? '')) return;
    const t = setTimeout(() => actualizar({ q: texto }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  const estado = params.get('estado') ?? '';

  return (
    <div className="grid gap-3">
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {ESTADOS.map((e) => (
          <button
            key={e.key}
            onClick={() => actualizar({ estado: e.v })}
            className={cn(
              'flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
              estado === e.v ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent',
            )}
          >
            {e.label}
            <span className={cn('rounded-full px-1.5 text-xs tabular-nums', estado === e.v ? 'bg-primary-foreground/20' : 'bg-muted text-muted-foreground')}>
              {conteos[e.key]}
            </span>
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar por nombre, teléfono o zona…"
            className="pl-9"
            aria-label="Buscar usuarios"
          />
          {pendiente && <Loader2Icon className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
        </div>
        <NativeSelect className="sm:w-48" value={params.get('zona') ?? ''} onChange={(e) => actualizar({ zona: e.target.value })} aria-label="Filtrar por zona">
          <option value="">Todas las zonas</option>
          {zonas.map((z) => <option key={z.zona} value={z.zona}>{z.zona} ({z.n})</option>)}
        </NativeSelect>
        <NativeSelect className="sm:w-60" value={params.get('orden') ?? ''} onChange={(e) => actualizar({ orden: e.target.value })} aria-label="Ordenar">
          <option value="">Vencimiento más cercano</option>
          <option value="registro">Registro más reciente</option>
          <option value="nombre">Nombre (A–Z)</option>
          <option value="alerta">Última alerta</option>
        </NativeSelect>
      </div>
    </div>
  );
}
