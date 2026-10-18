'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2Icon, RepeatIcon, SendIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { crearReenvio, eliminarBorrador, enviarDifusion } from '@/app/panel/(app)/difusiones/actions';
import type { EstadoDifusion } from '@/lib/datos-difusiones';

type Accion = 'enviar' | 'reenviar' | 'eliminar' | null;

export function AccionesDifusion({
  id, estado, destinatarios, sinResponder,
}: { id: number; estado: EstadoDifusion; destinatarios: number; sinResponder: number }) {
  const router = useRouter();
  const [accion, setAccion] = useState<Accion>(null);
  const [pendiente, iniciar] = useTransition();

  // Mientras se envía, refresca los estados cada 5 s
  useEffect(() => {
    if (estado !== 'enviando') return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [estado, router]);

  function ejecutar() {
    iniciar(async () => {
      if (accion === 'enviar') {
        const r = await enviarDifusion(id);
        if (r.ok) toast.success(r.mensaje); else toast.error(r.error);
        router.refresh();
      } else if (accion === 'reenviar') {
        const r = await crearReenvio(id);
        if (r.ok) { toast.success(r.mensaje); router.push(`/panel/difusiones/${r.id}`); } else toast.error(r.error);
      } else if (accion === 'eliminar') {
        const r = await eliminarBorrador(id);
        if (r.ok) { toast.success(r.mensaje); router.push('/panel/difusiones'); } else toast.error(r.error);
      }
      setAccion(null);
    });
  }

  const textos = {
    enviar: { t: '¿Enviar la difusión?', d: destinatarios ? `Se enviará a ${destinatarios} usuario(s) por WhatsApp.` : 'Se calcularán los destinatarios del segmento y se enviará por WhatsApp.', b: 'Sí, enviar' },
    reenviar: { t: 'Reenviar a quienes no respondieron', d: `Se creará una nueva difusión con el mismo mensaje para los ${sinResponder} usuario(s) que no respondieron. Podrás revisarla antes de enviarla.`, b: 'Crear reenvío' },
    eliminar: { t: '¿Eliminar el borrador?', d: 'Esta acción no se puede deshacer.', b: 'Eliminar' },
  };

  return (
    <>
      {(estado === 'borrador' || estado === 'error') && (
        <>
          <Button onClick={() => setAccion('enviar')}><SendIcon /> {estado === 'error' ? 'Reintentar envío' : 'Enviar'}</Button>
          {estado === 'borrador' && <Button variant="outline" onClick={() => setAccion('eliminar')}><Trash2Icon /> Eliminar</Button>}
        </>
      )}
      {estado === 'enviada' && sinResponder > 0 && (
        <Button variant="outline" onClick={() => setAccion('reenviar')}><RepeatIcon /> Reenviar a los que no respondieron ({sinResponder})</Button>
      )}

      <Dialog open={!!accion} onOpenChange={(o) => !o && setAccion(null)}>
        <DialogContent>
          {accion && (
            <>
              <DialogHeader>
                <DialogTitle>{textos[accion].t}</DialogTitle>
                <DialogDescription>{textos[accion].d}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAccion(null)} disabled={pendiente}>Cancelar</Button>
                <Button variant={accion === 'eliminar' ? 'destructive' : 'default'} onClick={ejecutar} disabled={pendiente}>
                  {pendiente && <Loader2Icon className="animate-spin" />} {textos[accion].b}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
