import { CheckCheckIcon, CheckIcon, ClockIcon, Loader2Icon, MessageCircleReplyIcon, XCircleIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { EstadoCampana, EstadoDestinatario } from '@/lib/datos-campanas';

const CAMPANA: Record<EstadoCampana, { texto: string; variante: 'prueba' | 'pagado' | 'vencido' | 'aviso' | 'neutro' }> = {
  programada: { texto: 'Programada', variante: 'prueba' },
  enviando: { texto: 'Enviando', variante: 'aviso' },
  pausada: { texto: 'Pausada', variante: 'neutro' },
  enviada: { texto: 'Enviada', variante: 'pagado' },
  cancelada: { texto: 'Cancelada', variante: 'vencido' },
};

export function EstadoCampanaBadge({ estado }: { estado: EstadoCampana }) {
  const e = CAMPANA[estado];
  return (
    <Badge variant={e.variante}>
      {estado === 'enviando' && <Loader2Icon className="animate-spin" />}
      {e.texto}
    </Badge>
  );
}

/** Estado de un mensaje: ícono + texto (nunca solo color) — ✓ enviado, ✓✓ entregado, ✓✓ azul leído */
export function EstadoDestinatario({ estado, respondio }: { estado: EstadoDestinatario; respondio?: boolean }) {
  const base = 'inline-flex items-center gap-1 text-sm whitespace-nowrap';
  const e = (() => {
    switch (estado) {
      case 'pendiente': return <span className={`${base} text-muted-foreground`}><ClockIcon className="size-4" /> Pendiente</span>;
      case 'enviando': return <span className={`${base} text-muted-foreground`}><Loader2Icon className="size-4 animate-spin" /> Enviando</span>;
      case 'enviado': return <span className={`${base} text-muted-foreground`}><CheckIcon className="size-4" /> Enviado</span>;
      case 'entregado': return <span className={`${base} text-muted-foreground`}><CheckCheckIcon className="size-4" /> Entregado</span>;
      case 'leido': return <span className={base}><CheckCheckIcon className="size-4 text-[#3987e5]" /> Leído</span>;
      case 'fallido': return <span className={`${base} text-estado-vencido`}><XCircleIcon className="size-4" /> Falló</span>;
    }
  })();
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2">
      {e}
      {respondio && <span className={`${base} text-estado-pagado`}><MessageCircleReplyIcon className="size-4" /> Respondió</span>}
    </span>
  );
}
