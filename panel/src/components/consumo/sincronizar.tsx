'use client';

import { useTransition } from 'react';
import { Loader2Icon, RefreshCwIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { sincronizarConsumo } from '@/app/panel/(app)/consumo/actions';

export function Sincronizar({ mes, deshabilitado }: { mes: string; deshabilitado?: boolean }) {
  const [pendiente, iniciar] = useTransition();
  return (
    <Button
      disabled={pendiente || deshabilitado}
      onClick={() => iniciar(async () => {
        const r = await sincronizarConsumo(mes);
        if (r.ok) toast.success(r.mensaje); else toast.error(r.error);
      })}
    >
      {pendiente ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
      {pendiente ? 'Leyendo Chatwoot…' : 'Sincronizar con Chatwoot'}
    </Button>
  );
}
