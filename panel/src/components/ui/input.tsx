import * as React from 'react';
import { cn } from '@/lib/utils';

const base =
  'w-full min-w-0 rounded-md border border-input bg-transparent text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground disabled:opacity-50 md:text-sm dark:bg-input/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return <input type={type} className={cn(base, 'h-9 px-3 py-1', className)} {...props} />;
}

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea className={cn(base, 'min-h-20 px-3 py-2', className)} {...props} />;
}

/** Select nativo con estilo: funciona perfecto en celulares */
function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return <select className={cn(base, 'h-9 bg-card px-3', className)} {...props} />;
}

function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return <label className={cn('text-sm font-medium leading-none', className)} {...props} />;
}

export { Input, Textarea, NativeSelect, Label };
