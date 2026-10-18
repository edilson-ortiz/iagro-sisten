'use client';

import { useState, useTransition } from 'react';
import { CheckCircle2Icon, ExternalLinkIcon, Loader2Icon, MapPinnedIcon, TriangleAlertIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { cambiarUbicacion } from '@/app/panel/(app)/usuarios/actions';
import { enBolivia, leerCoordenadas, validas } from '@/lib/coordenadas';

/** Distancia en km entre dos puntos (para mostrar cuánto se mueve la ubicación) */
function km(a: [number, number], b: [number, number]) {
  const r = (g: number) => (g * Math.PI) / 180;
  const h = Math.sin(r(b[0] - a[0]) / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(r(b[1] - a[1]) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** Vista satelital (misma fuente que la web del clima) centrada en el punto */
const satelite = (lat: number, lon: number) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${lon - 0.012},${lat - 0.008},${lon + 0.012},${lat + 0.008}&bboxSR=4326&size=480,320&format=jpg&f=image`;

export function CambiarUbicacion({ usuario }: { usuario: { id: number; latitud: number | null; longitud: number | null } }) {
  const [abierto, setAbierto] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const [pegado, setPegado] = useState('');
  const [lat, setLat] = useState(usuario.latitud != null ? String(usuario.latitud) : '');
  const [lon, setLon] = useState(usuario.longitud != null ? String(usuario.longitud) : '');

  const nLat = Number(lat.replace(',', '.'));
  const nLon = Number(lon.replace(',', '.'));
  const ok = lat.trim() !== '' && lon.trim() !== '' && validas(nLat, nLon);
  const cambia = ok && (nLat !== usuario.latitud || nLon !== usuario.longitud);
  const detectado = pegado.trim() ? leerCoordenadas(pegado) : null;
  const distancia = ok && usuario.latitud != null && usuario.longitud != null ? km([usuario.latitud, usuario.longitud], [nLat, nLon]) : null;

  function pegar(texto: string) {
    setPegado(texto);
    const c = leerCoordenadas(texto);
    if (c) { setLat(String(c.latitud)); setLon(String(c.longitud)); }
  }

  function guardar() {
    iniciar(async () => {
      const r = await cambiarUbicacion({ id: usuario.id, latitud: nLat, longitud: nLon });
      if (r.ok) { toast.success(r.mensaje); setAbierto(false); setPegado(''); } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><MapPinnedIcon /> Cambiar ubicación</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Cambiar ubicación del campo</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="u-pegar">Pegar ubicación</Label>
            <Input id="u-pegar" value={pegado} placeholder="-17.7833, -63.1821  o  enlace de Google Maps" onChange={(e) => pegar(e.target.value)} />
            {pegado.trim() && (detectado
              ? <p className="flex items-center gap-1.5 text-xs text-estado-pagado"><CheckCircle2Icon className="size-3.5" /> Coordenadas detectadas</p>
              : <p className="text-xs text-estado-aviso">
                  No se encontraron coordenadas. Si es un enlace corto (maps.app.goo.gl), ábrelo y copia el enlace largo del navegador o las coordenadas.
                </p>)}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="u-lat">Latitud</Label>
              <Input id="u-lat" inputMode="decimal" value={lat} placeholder="-17.7833" onChange={(e) => setLat(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="u-lon">Longitud</Label>
              <Input id="u-lon" inputMode="decimal" value={lon} placeholder="-63.1821" onChange={(e) => setLon(e.target.value)} />
            </div>
          </div>

          {ok && !enBolivia(nLat, nLon) && (
            <p className="flex items-start gap-2 rounded-lg bg-estado-aviso/10 px-3 py-2 text-sm text-estado-aviso">
              <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" /> Este punto está fuera de Bolivia. Revisa que latitud y longitud no estén invertidas.
            </p>
          )}

          {ok && (
            <div className="grid gap-2">
              <div className="relative overflow-hidden rounded-lg border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img key={`${nLat},${nLon}`} src={satelite(nLat, nLon)} alt="Vista satelital del nuevo punto" className="aspect-[3/2] w-full object-cover" />
                <span className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full text-2xl drop-shadow">📍</span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{distancia != null && cambia ? `Se mueve ${distancia < 1 ? `${Math.round(distancia * 1000)} m` : `${distancia.toFixed(1)} km`} de la ubicación actual` : 'Ubicación actual'}</span>
                <a href={`https://www.google.com/maps?q=${nLat},${nLon}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                  Ver en Google Maps <ExternalLinkIcon className="size-3" />
                </a>
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Se actualiza para las alertas, el radar web y el pronóstico (se recalcula en la próxima revisión horaria).</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setAbierto(false)} disabled={pendiente}>Cancelar</Button>
          <Button onClick={guardar} disabled={pendiente || !cambia}>{pendiente && <Loader2Icon className="animate-spin" />} Guardar ubicación</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
