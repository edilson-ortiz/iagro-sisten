'use client';

import { CopyIcon, ExternalLinkIcon, MessagesSquareIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** Enlace del chat web del usuario (firmado: solo abre el chat de ese número) */
export function EnlaceChat({ ruta }: { ruta: string }) {
  const copiar = async () => {
    const url = `${window.location.origin}${ruta}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Enlace del chat copiado', { description: url });
    } catch {
      window.prompt('Copia el enlace del chat:', url);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline"><MessagesSquareIcon /> Chat web</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={copiar}><CopyIcon /> Copiar enlace para el cliente</DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={ruta} target="_blank" rel="noopener noreferrer"><ExternalLinkIcon /> Abrir chat</a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
