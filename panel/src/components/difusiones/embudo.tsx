import { cn } from '@/lib/utils';

/** Barra de progreso del embudo: enviados → entregados → leídos → respondieron */
export function Embudo({
  total, enviados, entregados, leidos, respondieron, errores, compacto = false,
}: { total: number; enviados: number; entregados: number; leidos: number; respondieron: number; errores: number; compacto?: boolean }) {
  const pasos = [
    { label: 'Enviados', n: enviados, clase: 'bg-muted-foreground/40' },
    { label: 'Entregados', n: entregados, clase: 'bg-estado-prueba' },
    { label: 'Leídos', n: leidos, clase: 'bg-estado-pagado/70' },
    { label: 'Respondieron', n: respondieron, clase: 'bg-estado-pagado' },
  ];
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  return (
    <div className={cn('grid gap-2', compacto ? 'grid-cols-4' : 'grid-cols-2 sm:grid-cols-4')}>
      {pasos.map((p) => (
        <div key={p.label} className="min-w-0">
          <div className="flex items-baseline justify-between gap-1">
            <span className={cn('truncate text-muted-foreground', compacto ? 'text-[11px]' : 'text-xs')}>{p.label}</span>
            <span className={cn('font-medium tabular-nums', compacto ? 'text-xs' : 'text-sm')}>{p.n}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct(p.n)} aria-valuemin={0} aria-valuemax={100} aria-label={p.label}>
            <div className={cn('h-full rounded-full', p.clase)} style={{ width: `${pct(p.n)}%` }} />
          </div>
          {!compacto && <span className="text-xs text-muted-foreground tabular-nums">{pct(p.n)}%</span>}
        </div>
      ))}
      {errores > 0 && !compacto && <p className="col-span-full text-xs text-estado-vencido">{errores} envío(s) con error</p>}
    </div>
  );
}
