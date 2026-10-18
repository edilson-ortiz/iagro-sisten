import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap [&>svg]:size-3',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'text-foreground',
        prueba: 'border-estado-prueba/30 bg-estado-prueba/10 text-estado-prueba',
        pagado: 'border-estado-pagado/30 bg-estado-pagado/10 text-estado-pagado',
        vencido: 'border-estado-vencido/30 bg-estado-vencido/10 text-estado-vencido',
        aviso: 'border-estado-aviso/30 bg-estado-aviso/10 text-estado-aviso',
        neutro: 'border-border bg-muted text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

function Badge({ className, variant, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
