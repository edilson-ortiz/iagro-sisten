import { XCircleIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Reparto de los mensajes por estado: barra apilada al 100 % (parte de un todo).
 * Enviado → entregado → leído es una progresión: un solo tono azul, de claro a oscuro
 * (rampa ordinal validada en claro y oscuro). Fallido usa el rojo de estado y lleva ícono.
 */
const TRAMOS = [
  { clave: 'pendientes', etiqueta: 'Pendiente', color: 'bg-[#c4c3bd] dark:bg-[#4a4a46]' },
  { clave: 'enviado', etiqueta: 'Enviado', color: 'bg-[#86b6ef]' },
  { clave: 'entregado', etiqueta: 'Entregado', color: 'bg-[#3987e5]' },
  { clave: 'leido', etiqueta: 'Leído', color: 'bg-[#1c5cab]' },
  { clave: 'fallidos', etiqueta: 'Falló', color: 'bg-[#d03b3b]', icono: true },
] as const;

export type Reparto = Record<(typeof TRAMOS)[number]['clave'], number>;

const pct = (n: number, t: number) => (t ? (n / t) * 100 : 0);
const fmtPct = (n: number, t: number) => `${Math.round(pct(n, t))}%`;

export function BarraEstados({ reparto }: { reparto: Reparto }) {
  const total = TRAMOS.reduce((a, t) => a + reparto[t.clave], 0);
  const visibles = TRAMOS.filter((t) => reparto[t.clave] > 0);

  return (
    <figure className="grid gap-3">
      <div className="flex h-7 w-full gap-[2px] overflow-visible" role="img"
        aria-label={TRAMOS.map((t) => `${t.etiqueta}: ${reparto[t.clave]}`).join(', ')}>
        {total === 0 && <div className="h-full w-full rounded bg-muted" />}
        {visibles.map((t, i) => (
          <div
            key={t.clave}
            tabIndex={0}
            className={cn('group relative h-full min-w-[3px] outline-none first:rounded-l last:rounded-r focus-visible:ring-2 focus-visible:ring-ring', t.color,
              i === 0 && 'rounded-l', i === visibles.length - 1 && 'rounded-r')}
            style={{ width: `${pct(reparto[t.clave], total)}%` }}
          >
            {/* Tooltip al pasar el mouse o con el teclado */}
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 rounded-md border bg-popover px-2.5 py-1.5 text-xs whitespace-nowrap text-popover-foreground shadow-md group-hover:block group-focus-visible:block">
              <strong>{t.etiqueta}</strong> · {reparto[t.clave].toLocaleString('es-BO')} ({fmtPct(reparto[t.clave], total)})
            </span>
          </div>
        ))}
      </div>
      <figcaption>
        <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
          {TRAMOS.map((t) => (
            <li key={t.clave} className="flex items-center gap-1.5">
              {'icono' in t && t.icono
                ? <XCircleIcon className="size-3.5 text-[#d03b3b]" aria-hidden />
                : <span className={cn('size-2.5 rounded-sm', t.color)} aria-hidden />}
              <span className="text-muted-foreground">{t.etiqueta}</span>
              <span className="font-medium tabular-nums">{reparto[t.clave].toLocaleString('es-BO')}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{fmtPct(reparto[t.clave], total)}</span>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
