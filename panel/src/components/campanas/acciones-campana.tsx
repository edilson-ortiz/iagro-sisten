'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BanIcon, Loader2Icon, PauseIcon, PlayIcon, RotateCcwIcon, SendIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { accionCampana, eliminarCampana, reintentarFallidos } from '@/app/panel/(app)/campanas/actions';
import type { EstadoCampana } from '@/lib/datos-campanas';

export function AccionesCampana({ id, estado, fallidos }: { id: number; estado: EstadoCampana; fallidos: number }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();

  const correr = (fn: () => Promise<{ ok: boolean; mensaje?: string; error?: string }>, confirmar?: string, luego?: () => void) => {
    if (confirmar && !window.confirm(confirmar)) return;
    iniciar(async () => {
      const r = await fn();
      if (r.ok) { toast.success(r.mensaje); luego?.(); router.refresh(); } else toast.error(r.error);
    });
  };

  return (
    <>
      {pendiente && <Loader2Icon className="size-5 animate-spin self-center text-muted-foreground" />}
      {estado === 'programada' && (
        <Button variant="outline" disabled={pendiente} onClick={() => correr(() => accionCampana(id, 'enviar_ya'), '¿Enviar ahora sin esperar la fecha programada?')}>
          <SendIcon /> Enviar ahora
        </Button>
      )}
      {(estado === 'enviando' || estado === 'programada') && (
        <Button variant="outline" disabled={pendiente} onClick={() => correr(() => accionCampana(id, 'pausar'))}><PauseIcon /> Pausar</Button>
      )}
      {estado === 'pausada' && (
        <Button variant="outline" disabled={pendiente} onClick={() => correr(() => accionCampana(id, 'reanudar'))}><PlayIcon /> Reanudar</Button>
      )}
      {fallidos > 0 && (estado === 'enviada' || estado === 'enviando') && (
        <Button variant="outline" disabled={pendiente}
          onClick={() => correr(() => reintentarFallidos(id), `¿Volver a enviar a los ${fallidos} contactos que fallaron?`)}>
          <RotateCcwIcon /> Reintentar fallidos
        </Button>
      )}
      {(estado === 'programada' || estado === 'enviando' || estado === 'pausada') && (
        <Button variant="outline" className="text-destructive" disabled={pendiente}
          onClick={() => correr(() => accionCampana(id, 'cancelar'), 'Se cancela la difusión: lo que falta no se enviará. ¿Continuar?')}>
          <BanIcon /> Cancelar
        </Button>
      )}
      {estado !== 'enviando' && (
        <Button variant="ghost" className="text-destructive" disabled={pendiente}
          onClick={() => correr(() => eliminarCampana(id), 'Se elimina la difusión y su historial (los mensajes ya enviados quedan en Chatwoot). ¿Eliminar?',
            () => router.push('/panel/campanas'))}>
          <Trash2Icon /> Eliminar
        </Button>
      )}
    </>
  );
}
