import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function StatCard({
  titulo, valor, detalle, icon: Icon, tono = 'neutro', href,
}: {
  titulo: string;
  valor: string | number;
  detalle?: string;
  icon: LucideIcon;
  tono?: 'neutro' | 'prueba' | 'pagado' | 'vencido' | 'aviso';
  href?: string;
}) {
  const colores = {
    neutro: 'bg-muted text-muted-foreground',
    prueba: 'bg-estado-prueba/10 text-estado-prueba',
    pagado: 'bg-estado-pagado/10 text-estado-pagado',
    vencido: 'bg-estado-vencido/10 text-estado-vencido',
    aviso: 'bg-estado-aviso/10 text-estado-aviso',
  }[tono];

  const contenido = (
    <Card className={cn('h-full p-5', href && 'transition-colors hover:border-primary/40 hover:bg-accent/30')}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{titulo}</p>
        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', colores)}>
          <Icon className="size-4.5" />
        </span>
      </div>
      <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{valor}</p>
      {detalle && <p className="mt-1 text-xs text-muted-foreground">{detalle}</p>}
    </Card>
  );

  return href ? <Link href={href} className="block h-full rounded-xl focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none">{contenido}</Link> : contenido;
}
