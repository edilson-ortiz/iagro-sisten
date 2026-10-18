'use client';

import { useTransition } from 'react';
import { Loader2Icon, RotateCcwIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { reactivarUsuario } from '@/app/panel/(app)/difusiones/actions';

export function Reactivar({ usuarioId, texto = 'Reactivar' }: { usuarioId: number; texto?: string }) {
  const [pendiente, iniciar] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pendiente}
      onClick={() => iniciar(async () => {
        const r = await reactivarUsuario(usuarioId);
        if (r.ok) toast.success(r.mensaje); else toast.error(r.error);
      })}
    >
      {pendiente ? <Loader2Icon className="animate-spin" /> : <RotateCcwIcon />} {texto}
    </Button>
  );
}
