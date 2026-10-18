'use client';

import { useMemo, useState, useTransition } from 'react';
import { KeyRoundIcon, Loader2Icon, RotateCcwIcon, SaveIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input, Label, NativeSelect, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { guardarConfig } from '@/app/panel/(app)/configuracion/actions';
import type { ConfigFila } from '@/lib/datos-config';
import { cn } from '@/lib/utils';

const UNIDAD: Record<string, string> = {
  lluvia_umbral: '%', lluvia_horas_anticipacion: 'horas', lluvia_max_por_semana: 'por semana', lluvia_horas_entre_alertas: 'horas',
  lluvia_mm_minimo: 'mm', lluvia_agrupar_km: 'km', prueba_dias: 'días', pago_dias: 'días', aviso_vencimiento_dias: 'días',
  respuesta_ventana_dias: 'días', difusion_pausa_ms: 'ms', difusion_pausar_sin_respuesta: 'difusiones',
  lluvia_pausar_sin_leer: 'alertas', lluvia_horas_para_leer: 'horas',
  tokens_mes: 'mensajes',
  lluvia_fuerte_mm: 'mm', referidos_meta: 'amigos', referidos_premio_dias: 'días',
};

type Valor = string | boolean;
const aValor = (f: ConfigFila): Valor => (f.tipo === 'booleano' ? f.valor === true : f.valor == null ? '' : String(f.valor));

/** Frase que explica la regla de lluvia con los valores actuales del formulario */
function ResumenLluvia({ v }: { v: Record<string, Valor> }) {
  if (v.lluvia_activa === false) {
    return <p className="rounded-lg bg-estado-vencido/10 px-4 py-3 text-sm text-estado-vencido">Las alertas automáticas de lluvia están <strong>apagadas</strong>.</p>;
  }
  const max = Number(v.lluvia_max_por_semana || 1);
  return (
    <p className="rounded-lg bg-accent px-4 py-3 text-sm leading-relaxed">
      🌧️ Cada hora se consulta el pronóstico y se guarda la <strong>próxima lluvia</strong> de cada usuario (la que supera el <strong>{String(v.lluvia_umbral)}%</strong>
      {Number(v.lluvia_mm_minimo) > 0 && <> con al menos <strong>{String(v.lluvia_mm_minimo)} mm</strong></>}).
      Cuando faltan <strong>{String(v.lluvia_horas_anticipacion)} h o menos</strong>, se avisa por WhatsApp entre las <strong>{String(v.lluvia_hora_desde)}</strong> y
      las <strong>{String(v.lluvia_hora_hasta)}</strong>. Cada usuario recibe como máximo <strong>{max === 1 ? '1 alerta por semana' : `${max} alertas por semana`}</strong>
      {max > 1 && <>, con al menos <strong>{String(v.lluvia_horas_entre_alertas)} h</strong> entre una y otra</>}.
      {Number(v.lluvia_pausar_sin_leer) > 0
        ? <> Si no responde <strong>{String(v.lluvia_pausar_sin_leer)} alertas seguidas</strong> (o toca <em>Dejar de recibir</em>), se le desactivan hasta que lo reactives.</>
        : <> Nunca se desactiva por no responder (el botón <em>Dejar de recibir</em> sí las desactiva).</>}
    </p>
  );
}

export function FormGrupo({ grupo, filas }: { grupo: string; filas: ConfigFila[] }) {
  const inicial = useMemo(() => Object.fromEntries(filas.map((f) => [f.clave, aValor(f)])), [filas]);
  const [valores, setValores] = useState<Record<string, Valor>>(inicial);
  const [pendiente, iniciar] = useTransition();

  const cambios = Object.fromEntries(Object.entries(valores).filter(([k, v]) => v !== inicial[k]));
  const hayCambios = Object.keys(cambios).length > 0;
  const set = (k: string, v: Valor) => setValores((s) => ({ ...s, [k]: v }));

  function guardar() {
    iniciar(async () => {
      const r = await guardarConfig(cambios);
      if (r.ok) toast.success(r.mensaje); else toast.error(r.error);
    });
  }

  // Ocultar "horas entre alertas" si el tope es 1 por semana (no aplica)
  const visibles = filas.filter((f) => !(f.clave === 'lluvia_horas_entre_alertas' && Number(valores.lluvia_max_por_semana) <= 1)
    && !(f.clave === 'lluvia_horas_para_leer' && Number(valores.lluvia_pausar_sin_leer) === 0));

  return (
    <div className="grid gap-5">
      {grupo === 'lluvia' && <ResumenLluvia v={valores} />}

      <div className={cn('grid gap-x-6 gap-y-5', grupo !== 'mensajes' && 'md:grid-cols-2')}>
        {visibles.map((f) => {
          const id = `cfg-${f.clave}`;
          const v = valores[f.clave];
          const largo = f.tipo === 'texto_largo';
          return (
            <div key={f.clave} className={cn('grid content-start gap-2', (largo || f.tipo === 'secreto') && 'md:col-span-2')}>
              {f.tipo === 'booleano' ? (
                <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
                  <div>
                    <Label htmlFor={id}>{f.etiqueta}</Label>
                    {f.descripcion && <p className="mt-1 text-xs text-muted-foreground">{f.descripcion}</p>}
                  </div>
                  <Switch id={id} checked={v === true} onChange={(x) => set(f.clave, x)} label={f.etiqueta} />
                </div>
              ) : (
                <>
                  <Label htmlFor={id}>{f.etiqueta}</Label>
                  {f.tipo === 'numero' && (
                    <div className="flex items-center gap-2">
                      <Input id={id} type="number" inputMode="decimal" className="max-w-40" value={String(v)} onChange={(e) => set(f.clave, e.target.value)} />
                      {UNIDAD[f.clave] && <span className="text-sm text-muted-foreground">{UNIDAD[f.clave]}</span>}
                    </div>
                  )}
                  {f.tipo === 'hora' && <Input id={id} type="time" className="max-w-40" value={String(v)} onChange={(e) => set(f.clave, e.target.value)} />}
                  {f.tipo === 'texto' && <Input id={id} value={String(v)} onChange={(e) => set(f.clave, e.target.value)} />}
                  {f.tipo === 'opcion' && (
                    <NativeSelect id={id} value={String(v)} onChange={(e) => set(f.clave, e.target.value)}>
                      {(f.opciones ?? []).map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
                    </NativeSelect>
                  )}
                  {largo && <Textarea id={id} rows={4} value={String(v)} onChange={(e) => set(f.clave, e.target.value)} />}
                  {f.tipo === 'secreto' && (
                    <p className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                      <KeyRoundIcon className="size-4" /> Generado automáticamente y guardado en la base. n8n lo lee directamente.
                    </p>
                  )}
                  {f.descripcion && <p className="text-xs text-muted-foreground">{f.descripcion}</p>}
                  {largo && <p className="text-xs text-muted-foreground">Variables: {'{nombre}'} {'{zona}'} {'{dias}'} {'{vence_el}'} · *negrita* _cursiva_</p>}
                </>
              )}
            </div>
          );
        })}
      </div>

      {filas.some((f) => f.tipo !== 'secreto') && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
          {hayCambios && <span className="mr-auto text-sm text-estado-aviso">{Object.keys(cambios).length} cambio(s) sin guardar</span>}
          <Button variant="ghost" disabled={!hayCambios || pendiente} onClick={() => setValores(inicial)}><RotateCcwIcon /> Deshacer</Button>
          <Button disabled={!hayCambios || pendiente} onClick={guardar}>
            {pendiente ? <Loader2Icon className="animate-spin" /> : <SaveIcon />} Guardar cambios
          </Button>
        </div>
      )}
    </div>
  );
}
