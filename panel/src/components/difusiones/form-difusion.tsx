'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2Icon, SaveIcon, SendIcon, UsersIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Label, NativeSelect, Textarea } from '@/components/ui/input';
import { crearDifusion, vistaPreviaSegmento } from '@/app/panel/(app)/difusiones/actions';
import type { Segmento } from '@/lib/datos-difusiones';
import { cn } from '@/lib/utils';

const SEGMENTOS: { v: Segmento; label: string; desc: string }[] = [
  { v: 'todos', label: 'Todos', desc: 'Todos los usuarios activos' },
  { v: 'prueba', label: 'En prueba', desc: 'Usuarios en su mes gratis' },
  { v: 'pagado', label: 'Pagados', desc: 'Suscripción pagada' },
  { v: 'vencido', label: 'Vencidos', desc: 'Para invitarlos a renovar' },
  { v: 'zona', label: 'Por zona', desc: 'Usuarios de una zona' },
];

/** Formato de WhatsApp: *negrita* _cursiva_ ~tachado~ */
function FormatoWhatsapp({ texto }: { texto: string }) {
  const partes = texto.split(/(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g);
  return (
    <>
      {partes.map((p, i) =>
        /^\*.+\*$/.test(p) ? <strong key={i}>{p.slice(1, -1)}</strong>
          : /^_.+_$/.test(p) ? <em key={i}>{p.slice(1, -1)}</em>
          : /^~.+~$/.test(p) ? <s key={i}>{p.slice(1, -1)}</s>
          : <span key={i}>{p}</span>,
      )}
    </>
  );
}

export function FormDifusion({ zonas, plantillaDefecto, pausaActiva }: { zonas: { zona: string; n: number }[]; plantillaDefecto: string; pausaActiva: boolean }) {
  const router = useRouter();
  const [f, setF] = useState({ titulo: '', mensaje: '', segmento: 'todos' as Segmento, zona: zonas[0]?.zona ?? '', plantilla: '' });
  const [vista, setVista] = useState<{ destinatarios: number; pausados: number; muestra: { id: number; nombre: string | null; telefono: string }[] } | null>(null);
  const [cargando, setCargando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [pendiente, iniciar] = useTransition();

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    vistaPreviaSegmento(f.segmento, f.segmento === 'zona' ? f.zona : null)
      .then((v) => { if (vigente) setVista(v); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [f.segmento, f.zona]);

  const ejemploNombre = (vista?.muestra[0]?.nombre ?? 'Juan').trim().split(/\s+/)[0];
  const vistaPrevia = f.mensaje.replaceAll('{nombre}', ejemploNombre);

  function guardar(enviar: boolean) {
    iniciar(async () => {
      const r = await crearDifusion({ ...f, zona: f.segmento === 'zona' ? f.zona : undefined, plantilla: f.plantilla || undefined }, enviar);
      setConfirmar(false);
      if (r.ok) toast.success(r.mensaje); else toast.error(r.error);
      if (r.id) router.push(`/panel/difusiones/${r.id}`);
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <Card className="grid gap-5 p-5 sm:p-6">
        <div className="grid gap-2">
          <Label htmlFor="d-titulo">Título interno</Label>
          <Input id="d-titulo" placeholder="Ej: Aviso inicio de siembra" value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} />
          <p className="text-xs text-muted-foreground">Solo lo ves tú en el panel.</p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="d-mensaje">Mensaje</Label>
          <Textarea id="d-mensaje" rows={6} maxLength={1000} placeholder="Hola {nombre}, ..." value={f.mensaje} onChange={(e) => setF({ ...f, mensaje: e.target.value })} />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{'{nombre}'} se reemplaza por el nombre · *negrita* _cursiva_</span>
            <span className="tabular-nums">{f.mensaje.length}/1000</span>
          </div>
        </div>

        <div className="grid gap-2">
          <Label>Destinatarios</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {SEGMENTOS.map((s) => (
              <button
                key={s.v}
                type="button"
                onClick={() => setF({ ...f, segmento: s.v })}
                aria-pressed={f.segmento === s.v}
                className={cn(
                  'cursor-pointer rounded-lg border p-3 text-left transition-colors',
                  f.segmento === s.v ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-accent',
                )}
              >
                <span className="block text-sm font-medium">{s.label}</span>
                <span className="text-xs text-muted-foreground">{s.desc}</span>
              </button>
            ))}
          </div>
          {f.segmento === 'zona' && (
            zonas.length ? (
              <NativeSelect value={f.zona} onChange={(e) => setF({ ...f, zona: e.target.value })} aria-label="Zona">
                {zonas.map((z) => <option key={z.zona} value={z.zona}>{z.zona} ({z.n})</option>)}
              </NativeSelect>
            ) : <p className="text-sm text-estado-aviso">Ningún usuario tiene zona asignada todavía.</p>
          )}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="d-plantilla">Plantilla de WhatsApp (opcional)</Label>
          <Input id="d-plantilla" placeholder={plantillaDefecto || 'difusion_general'} value={f.plantilla} onChange={(e) => setF({ ...f, plantilla: e.target.value.trim() })} />
          <p className="text-xs text-muted-foreground">
            A quien no escribió en las últimas 24 h, WhatsApp solo permite enviarle una plantilla aprobada por Meta. Vacío = se usa <code>{plantillaDefecto || 'difusion_general'}</code> con tu mensaje como variable.
          </p>
        </div>
      </Card>

      <div className="grid content-start gap-4">
        <Card className="p-5">
          <p className="mb-1 flex items-center gap-2 text-sm font-medium"><UsersIcon className="size-4" /> Se enviará a</p>
          <p className="text-3xl font-semibold tabular-nums">
            {cargando && !vista ? <Loader2Icon className="size-6 animate-spin" /> : vista?.destinatarios ?? 0}
            <span className="ml-1 text-base font-normal text-muted-foreground">usuario{vista?.destinatarios === 1 ? '' : 's'}</span>
          </p>
          {pausaActiva && !!vista?.pausados && (
            <p className="mt-1 text-xs text-estado-aviso">{vista.pausados} del segmento no recibirán: están pausados por no responder.</p>
          )}
          {!!vista?.muestra.length && (
            <p className="mt-2 text-xs text-muted-foreground">
              {vista.muestra.slice(0, 4).map((m) => (m.nombre ?? m.telefono).split(' ').slice(0, 2).join(' ')).join(', ')}
              {vista.destinatarios > 4 ? ` y ${vista.destinatarios - 4} más` : ''}
            </p>
          )}
        </Card>

        <div className="overflow-hidden rounded-xl border">
          <div className="bg-[#008069] px-4 py-2.5 text-sm font-medium text-white">Vista previa · WhatsApp</div>
          <div className="min-h-40 bg-[#efeae2] p-4 dark:bg-[#0b141a]">
            {f.mensaje ? (
              <div className="relative ml-1 max-w-[90%] rounded-lg rounded-tl-none bg-white px-3 py-2 text-sm whitespace-pre-wrap text-[#111b21] shadow-sm dark:bg-[#202c33] dark:text-[#e9edef]">
                <FormatoWhatsapp texto={vistaPrevia} />
                <span className="mt-1 block text-right text-[10px] text-[#667781]">09:41</span>
              </div>
            ) : <p className="text-center text-xs text-[#667781]">Escribe el mensaje para ver cómo se verá.</p>}
          </div>
        </div>

        <div className="grid gap-2">
          <Button size="lg" disabled={pendiente || !vista?.destinatarios} onClick={() => setConfirmar(true)}><SendIcon /> Enviar ahora</Button>
          <Button variant="outline" disabled={pendiente} onClick={() => guardar(false)}>
            {pendiente ? <Loader2Icon className="animate-spin" /> : <SaveIcon />} Guardar borrador
          </Button>
        </div>
      </div>

      <Dialog open={confirmar} onOpenChange={setConfirmar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Enviar la difusión?</DialogTitle>
            <DialogDescription>
              Se enviará a <strong>{vista?.destinatarios}</strong> usuario{vista?.destinatarios === 1 ? '' : 's'} por WhatsApp. No se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmar(false)} disabled={pendiente}>Cancelar</Button>
            <Button onClick={() => guardar(true)} disabled={pendiente}>{pendiente && <Loader2Icon className="animate-spin" />} Sí, enviar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
