'use client';

import { useOptimistic, useTransition } from 'react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { cambiarAlertas } from '@/app/panel/(app)/alertas/actions';

/** Interruptor de alertas de lluvia de un usuario (ficha) */
export function InterruptorAlertas({ usuarioId, activas }: { usuarioId: number; activas: boolean }) {
  const [pendiente, iniciar] = useTransition();
  const [valor, setValor] = useOptimistic(activas);
  return (
    <Switch
      checked={valor}
      disabled={pendiente}
      label="Alertas de lluvia"
      onChange={(v) => iniciar(async () => {
        setValor(v);
        const r = await cambiarAlertas(usuarioId, v);
        if (r.ok) toast.success(r.mensaje); else toast.error(r.error);
      })}
    />
  );
}
