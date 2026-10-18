import { CheckCheckIcon, CheckIcon, ClockIcon, MessageCircleReplyIcon, XCircleIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { EstadoMensaje, EstadoUsuario } from '@/lib/db/schema';

const ETIQUETA: Record<EstadoUsuario, string> = { prueba: 'En prueba', pagado: 'Pagado', vencido: 'Vencido' };

export function EstadoBadge({ estado, activo = true }: { estado: EstadoUsuario; activo?: boolean }) {
  if (!activo) return <Badge variant="neutro">Inactivo</Badge>;
  return <Badge variant={estado}>{ETIQUETA[estado]}</Badge>;
}

/** Días restantes con color según urgencia */
export function DiasRestantes({ dias, estado }: { dias: number; estado: EstadoUsuario }) {
  if (estado === 'vencido' || dias < 0) {
    return <span className="text-sm text-estado-vencido">Venció hace {Math.abs(dias)} d</span>;
  }
  const clase = dias <= 3 ? 'text-estado-vencido font-medium' : dias <= 7 ? 'text-estado-aviso font-medium' : 'text-foreground';
  return <span className={`text-sm tabular-nums ${clase}`}>{dias === 0 ? 'Vence hoy' : `${dias} días`}</span>;
}

const MENSAJE: Record<EstadoMensaje, { label: string; variant: 'neutro' | 'prueba' | 'pagado' | 'vencido'; Icon: typeof CheckIcon }> = {
  enviado: { label: 'Enviado', variant: 'neutro', Icon: CheckIcon },
  entregado: { label: 'Entregado', variant: 'prueba', Icon: CheckCheckIcon },
  leido: { label: 'Leído', variant: 'pagado', Icon: CheckCheckIcon },
  fallido: { label: 'Falló', variant: 'vencido', Icon: XCircleIcon },
};

export function EstadoMensajeBadge({ estado, respondio }: { estado: EstadoMensaje; respondio?: boolean }) {
  if (respondio) {
    return (
      <Badge variant="pagado">
        <MessageCircleReplyIcon /> Respondió
      </Badge>
    );
  }
  const m = MENSAJE[estado] ?? { label: estado, variant: 'neutro', Icon: ClockIcon };
  return (
    <Badge variant={m.variant}>
      <m.Icon /> {m.label}
    </Badge>
  );
}
