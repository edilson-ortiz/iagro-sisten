'use client';

import { useTransition } from 'react';
import { BellRingIcon, Loader2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { reactivarAlertas } from '@/app/panel/(app)/alertas/actions';

export function ReactivarAlertas({ usuarioId, texto = 'Reactivar' }: { usuarioId: number; texto?: string }) {
  const [pendiente, iniciar] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pendiente}
      onClick={() => iniciar(async () => {
        const r = await reactivarAlertas(usuarioId);
        if (r.ok) toast.success(r.mensaje); else toast.error(r.error);
      })}
    >
      {pendiente ? <Loader2Icon className="animate-spin" /> : <BellRingIcon />} {texto}
    </Button>
  );
}
