'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Loader2Icon, SearchIcon } from 'lucide-react';
import { Input, NativeSelect } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Filtros genéricos que viven en la URL: pestañas, búsqueda y selects */
export function FiltrosUrl({
  pestanas, param = 'estado', busqueda, selects = [],
}: {
  pestanas?: { v: string; label: string; n?: number }[];
  param?: string;
  busqueda?: string;
  selects?: { param: string; opciones: { v: string; label: string }[]; label: string; defecto?: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pendiente, iniciar] = useTransition();
  const [texto, setTexto] = useState(params.get('q') ?? '');

  function actualizar(cambios: Record<string, string>) {
    const p = new URLSearchParams(params.toString());
    p.delete('pagina'); // al cambiar un filtro se vuelve a la primera página
    for (const [k, v] of Object.entries(cambios)) {
      if (v) p.set(k, v); else p.delete(k);
    }
    iniciar(() => router.replace(`${pathname}?${p.toString()}`, { scroll: false }));
  }

  useEffect(() => {
    if (texto === (params.get('q') ?? '')) return;
    const t = setTimeout(() => actualizar({ q: texto }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  const actual = params.get(param) ?? '';

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3">
      {pestanas && (
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {pestanas.map((e) => (
            <button
              key={e.v || 'todos'}
              onClick={() => actualizar({ [param]: e.v })}
              className={cn(
                'flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
                actual === e.v ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent',
              )}
            >
              {e.label}
              {e.n !== undefined && (
                <span className={cn('rounded-full px-1.5 text-xs tabular-nums', actual === e.v ? 'bg-primary-foreground/20' : 'bg-muted text-muted-foreground')}>{e.n}</span>
              )}
            </button>
          ))}
        </div>
      )}
      {(busqueda || selects.length > 0) && (
        <div className="flex flex-col gap-2 sm:flex-row">
          {busqueda && (
            <div className="relative flex-1">
              <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={busqueda} className="pl-9" aria-label={busqueda} />
              {pendiente && <Loader2Icon className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
            </div>
          )}
          {selects.map((s) => (
            <NativeSelect key={s.param} className="sm:w-52" aria-label={s.label} value={params.get(s.param) ?? s.defecto ?? ''} onChange={(e) => actualizar({ [s.param]: e.target.value })}>
              {s.opciones.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
            </NativeSelect>
          ))}
        </div>
      )}
    </div>
  );
}
