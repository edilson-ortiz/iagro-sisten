import { Loader2Icon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { EstadoDifusion, Segmento } from '@/lib/datos-difusiones';

export function EstadoDifusionBadge({ estado }: { estado: EstadoDifusion }) {
  switch (estado) {
    case 'borrador': return <Badge variant="neutro">Borrador</Badge>;
    case 'enviando': return <Badge variant="aviso"><Loader2Icon className="animate-spin" /> Enviando</Badge>;
    case 'enviada': return <Badge variant="pagado">Enviada</Badge>;
    case 'error': return <Badge variant="vencido">Error</Badge>;
  }
}

export function etiquetaSegmento(s: Segmento, zona?: string | null) {
  return { todos: 'Todos', prueba: 'En prueba', pagado: 'Pagados', vencido: 'Vencidos', zona: `Zona: ${zona ?? '—'}` }[s];
}
