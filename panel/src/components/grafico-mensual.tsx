'use client';

import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { TableIcon, BarChart3Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Punto = { mes: string; registros: number; conversiones: number };

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const etiquetaMes = (m: string) => {
  const [a, mm] = m.split('-');
  return `${MESES[Number(mm) - 1]} ${a!.slice(2)}`;
};

const SERIES = [
  { key: 'registros', label: 'Registros', color: 'var(--chart-1)' },
  { key: 'conversiones', label: 'Conversiones (primer pago)', color: 'var(--chart-2)' },
] as const;

function TooltipMes({ active, payload, label }: { active?: boolean; payload?: { dataKey: string; value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const reg = payload.find((p) => p.dataKey === 'registros')?.value ?? 0;
  const conv = payload.find((p) => p.dataKey === 'conversiones')?.value ?? 0;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="mb-1 font-medium">{label && etiquetaMes(label)}</p>
      {SERIES.map((s) => (
        <p key={s.key} className="flex items-center gap-2">
          <span className="size-2.5 rounded-sm" style={{ background: s.color }} />
          <span className="text-muted-foreground">{s.label}:</span>
          <span className="ml-auto font-medium tabular-nums">{s.key === 'registros' ? reg : conv}</span>
        </p>
      ))}
    </div>
  );
}

export function GraficoMensual({ datos }: { datos: Punto[] }) {
  const [vistaTabla, setVistaTabla] = useState(false);
  const totalReg = datos.reduce((a, d) => a + d.registros, 0);
  const totalConv = datos.reduce((a, d) => a + d.conversiones, 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="size-3 rounded-sm" style={{ background: s.color }} />
            {s.label}
            <span className="font-medium text-foreground tabular-nums">{s.key === 'registros' ? totalReg : totalConv}</span>
          </span>
        ))}
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setVistaTabla((v) => !v)}>
          {vistaTabla ? <BarChart3Icon /> : <TableIcon />}
          {vistaTabla ? 'Ver gráfico' : 'Ver tabla'}
        </Button>
      </div>

      {vistaTabla ? (
        <div className="max-h-72 overflow-y-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr><th className="px-3 py-2">Mes</th><th className="px-3 py-2 text-right">Registros</th><th className="px-3 py-2 text-right">Conversiones</th><th className="px-3 py-2 text-right">Tasa</th></tr>
            </thead>
            <tbody>
              {[...datos].reverse().map((d) => (
                <tr key={d.mes} className="border-t">
                  <td className="px-3 py-2">{etiquetaMes(d.mes)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{d.registros}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{d.conversiones}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {d.registros ? `${Math.round((d.conversiones / d.registros) * 100)}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-72" role="img" aria-label="Gráfico de registros y conversiones por mes">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={datos} barGap={2} barCategoryGap="22%" margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="mes" tickFormatter={etiquetaMes} tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" interval="preserveStartEnd" />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
              <Tooltip content={<TooltipMes />} cursor={{ fill: 'var(--muted)', opacity: 0.6 }} />
              {SERIES.map((s) => (
                <Bar key={s.key} dataKey={s.key} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={22} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
