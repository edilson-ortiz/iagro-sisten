'use client';

import { useState, useTransition } from 'react';
import { BellRingIcon, Loader2Icon, SendIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input, Label, NativeSelect, Textarea } from '@/components/ui/input';
import { enviarDifusionPush } from '@/app/panel/(app)/app-web/actions';

type Segmento = 'avisos' | 'instalada' | 'numero';

/** Formulario de difusión por notificación push, con vista previa de cómo se ve en el celular */
export function FormDifusionPush({ destinatarios }: { destinatarios: { avisos: number; instalada: number } }) {
  const [titulo, setTitulo] = useState('IAGRO Clima');
  const [texto, setTexto] = useState('');
  const [segmento, setSegmento] = useState<Segmento>('avisos');
  const [numero, setNumero] = useState('');
  const [enviando, iniciar] = useTransition();

  const cantidad = segmento === 'numero' ? 1 : destinatarios[segmento];

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    const quien = segmento === 'numero' ? `al número ${numero}` : `a ${cantidad} persona(s)`;
    if (!window.confirm(`¿Enviar esta notificación ${quien}?`)) return;
    iniciar(async () => {
      const r = await enviarDifusionPush({ titulo, texto, segmento, numero });
      if (r.ok) { toast.success(r.mensaje); setTexto(''); }
      else toast.error(r.error);
    });
  };

  return (
    <form onSubmit={enviar} className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="dp-segmento">Enviar a</Label>
          <NativeSelect id="dp-segmento" value={segmento} onChange={(e) => setSegmento(e.target.value as Segmento)}>
            <option value="avisos">Todos con notificaciones activas ({destinatarios.avisos})</option>
            <option value="instalada">Solo los que instalaron la app ({destinatarios.instalada})</option>
            <option value="numero">Un número (para probar)</option>
          </NativeSelect>
        </div>
        {segmento === 'numero' && (
          <div className="grid gap-1.5">
            <Label htmlFor="dp-numero">Número</Label>
            <Input id="dp-numero" inputMode="tel" placeholder="76098116" value={numero} onChange={(e) => setNumero(e.target.value)} />
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="dp-titulo">Título</Label>
          <Input id="dp-titulo" maxLength={60} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="dp-texto">Mensaje</Label>
            <span className="text-xs tabular-nums text-muted-foreground">{texto.length}/240</span>
          </div>
          <Textarea id="dp-texto" rows={4} maxLength={240} value={texto} onChange={(e) => setTexto(e.target.value)}
                    placeholder="🌧️ Se esperan lluvias fuertes este fin de semana en Santa Cruz. Toca para ver tu pronóstico." />
          <p className="text-xs text-muted-foreground">Al tocar la notificación, se abre el chat de cada persona.</p>
        </div>
        <div>
          <Button type="submit" disabled={enviando || !texto.trim() || !titulo.trim() || cantidad === 0}>
            {enviando ? <Loader2Icon className="animate-spin" /> : <SendIcon />} Enviar notificación
          </Button>
        </div>
      </div>

      {/* Vista previa */}
      <div className="rounded-2xl bg-gradient-to-b from-slate-700 to-slate-900 p-4">
        <p className="mb-3 text-center text-xs font-medium text-white/70">Así se verá en el celular</p>
        <div className="rounded-xl bg-white/95 p-3 text-slate-900 shadow-lg">
          <div className="mb-1 flex items-center gap-2 text-[11px] text-slate-500">
            <BellRingIcon className="size-3" /> IAGRO Clima · ahora
          </div>
          <div className="flex gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/img/app-96.png" alt="" className="size-9 shrink-0 rounded-full" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{titulo || 'Título'}</p>
              <p className="line-clamp-4 text-sm text-slate-700">{texto || 'Escribe tu mensaje…'}</p>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
