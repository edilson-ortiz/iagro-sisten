'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type * as Leaflet from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  CheckIcon, DownloadIcon, FileSpreadsheetIcon, HandIcon, LassoSelectIcon, LayersIcon, Loader2Icon, LocateFixedIcon,
  MinusIcon, PlusIcon, SearchIcon, SendIcon, SquareDashedIcon, TagIcon, Undo2Icon, XIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import type { PuntoMapa } from '@/lib/datos-mapa';
import { CLAVE_DESDE_MAPA, type ArchivoContactos } from '@/lib/campanas/desde-mapa';
import { cn, fmtTelefono } from '@/lib/utils';
import s from './mapa.module.css';

type Categoria = 'prueba' | 'pagado' | 'vencido' | 'inactivo';
type Herramienta = 'mano' | 'rect' | 'zona';

const CATEGORIAS: { id: Categoria; label: string; color: string }[] = [
  { id: 'prueba', label: 'En prueba', color: '#3987e5' },
  { id: 'pagado', label: 'Pagado', color: '#1f9d55' },
  { id: 'vencido', label: 'Vencido', color: '#d03b3b' },
  { id: 'inactivo', label: 'Inactivo', color: '#8a8f98' },
];
const COLOR = Object.fromEntries(CATEGORIAS.map((c) => [c.id, c.color])) as Record<Categoria, string>;
const SELECCION = '#f5b301';
const MAX_ETIQUETAS = 400;

const categoria = (p: PuntoMapa): Categoria => (!p.activo ? 'inactivo' : p.estado);
const etiquetaDe = (p: PuntoMapa) => p.nombre?.trim() || `${p.latitud.toFixed(5)}, ${p.longitud.toFixed(5)}`;
const sinAcentos = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const zonaDe = (p: PuntoMapa) => p.zona?.trim() || 'Sin zona';
/** "Santa Cruz" y "santa cruz" son la misma zona */
const claveZona = (z: string) => sinAcentos(z).replace(/\s+/g, ' ');

function agruparZonas(lista: PuntoMapa[]) {
  const m = new Map<string, { nombre: string; n: number }>();
  for (const p of lista) {
    const k = claveZona(zonaDe(p));
    const g = m.get(k);
    if (g) g.n++; else m.set(k, { nombre: zonaDe(p), n: 1 });
  }
  return [...m.entries()].map(([clave, g]) => ({ clave, ...g }));
}

/** ¿El punto está dentro del polígono? (ray casting sobre lat/lon) */
function dentro(lat: number, lon: number, poli: [number, number][]) {
  let si = false;
  for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) {
    const [yi, xi] = poli[i]!;
    const [yj, xj] = poli[j]!;
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) si = !si;
  }
  return si;
}

const ESTADO_TEXTO: Record<Categoria, string> = { prueba: 'En prueba', pagado: 'Pagado', vencido: 'Vencido', inactivo: 'Inactivo' };

function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function MapaClientes({ puntos, sinUbicacion }: { puntos: PuntoMapa[]; sinUbicacion: number }) {
  const router = useRouter();
  const contenedor = useRef<HTMLDivElement>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const mapa = useRef<Leaflet.Map | null>(null);
  const capas = useRef<{ mapa: Leaflet.TileLayer; satelite: Leaflet.LayerGroup; puntos: Leaflet.LayerGroup; etiquetas: Leaflet.LayerGroup } | null>(null);
  const marcadores = useRef(new Map<number, Leaflet.CircleMarker>());
  const [listo, setListo] = useState(false);

  // Filtros
  const [q, setQ] = useState('');
  const [cats, setCats] = useState<Set<Categoria>>(new Set(['prueba', 'pagado', 'vencido', 'inactivo']));
  const [zona, setZona] = useState('');
  const [alertas, setAlertas] = useState<'todas' | 'con' | 'sin'>('todas');

  // Selección y herramientas
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [herramienta, setHerramienta] = useState<Herramienta>('mano');
  const [modo, setModo] = useState<'agregar' | 'quitar'>('agregar');
  const [vertices, setVertices] = useState(0);
  const [nombres, setNombres] = useState(true);
  const [capa, setCapa] = useState<'mapa' | 'satelite'>('mapa');
  const [vista, setVista] = useState(0); // cambia al mover el mapa
  const [exportando, iniciarExport] = useTransition();

  const zonas = useMemo(() => agruparZonas(puntos).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')), [puntos]);

  const filtrados = useMemo(() => {
    const t = sinAcentos(q.trim());
    return puntos.filter((p) =>
      cats.has(categoria(p)) &&
      (!zona || claveZona(zonaDe(p)) === zona) &&
      (alertas === 'todas' || (alertas === 'con') === p.alertas_activas) &&
      (!t || sinAcentos(`${p.nombre ?? ''} ${p.telefono} ${p.zona ?? ''}`).includes(t)));
  }, [puntos, q, cats, zona, alertas]);
  const idsFiltrados = useMemo(() => new Set(filtrados.map((p) => p.id)), [filtrados]);

  // Los manejadores de Leaflet se crean una vez: leen el estado actual desde refs
  const ref = useRef({ herramienta, modo, filtrados, sel });
  ref.current = { herramienta, modo, filtrados, sel };

  function aplicar(ids: number[], origen: string, forzar?: 'agregar') {
    const { sel: actual } = ref.current;
    const m = forzar ?? ref.current.modo;
    const nueva = new Set(actual);
    let n = 0;
    for (const id of ids) {
      if (m === 'agregar' && !nueva.has(id)) { nueva.add(id); n++; }
      if (m === 'quitar' && nueva.has(id)) { nueva.delete(id); n++; }
    }
    setSel(nueva);
    if (!ids.length) toast.info(`No hay clientes visibles dentro de ${origen}.`);
    else toast.success(m === 'agregar' ? `${n} agregado${n === 1 ? '' : 's'} a la selección` : `${n} quitado${n === 1 ? '' : 's'} de la selección`);
  }
  const aplicarRef = useRef(aplicar);
  aplicarRef.current = aplicar;

  // Dibujo de zona (polígono) en curso
  const dibujo = useRef<{ puntos: Leaflet.LatLng[]; forma: Leaflet.Polygon | null }>({ puntos: [], forma: null });

  function cancelarZona() {
    dibujo.current.forma?.remove();
    dibujo.current = { puntos: [], forma: null };
    setVertices(0);
  }
  function deshacerVertice() {
    const d = dibujo.current;
    d.puntos.pop();
    d.forma?.setLatLngs(d.puntos);
    setVertices(d.puntos.length);
  }
  function terminarZona() {
    const pts = dibujo.current.puntos;
    if (pts.length < 3) { toast.error('Marca al menos 3 puntos para cerrar la zona.'); return; }
    const poli = pts.map((p) => [p.lat, p.lng] as [number, number]);
    const ids = ref.current.filtrados.filter((p) => dentro(p.latitud, p.longitud, poli)).map((p) => p.id);
    cancelarZona();
    aplicarRef.current(ids, 'la zona');
  }
  const terminarRef = useRef(terminarZona);
  terminarRef.current = terminarZona;

  // ------------------------------------------------------------ Mapa (una vez)
  useEffect(() => {
    let cancelado = false;
    import('leaflet').then((mod) => {
      if (cancelado || !contenedor.current || mapa.current) return;
      const Lf = (mod as unknown as { default?: typeof Leaflet }).default ?? (mod as typeof Leaflet);
      L.current = Lf;
      const m = Lf.map(contenedor.current, { preferCanvas: true, zoomControl: false }).setView([-17.4, -63.2], 8);
      Lf.control.zoom({ position: 'bottomright' }).addTo(m);
      Lf.control.scale({ imperial: false, position: 'bottomleft' }).addTo(m);
      const calle = Lf.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; OpenStreetMap',
      }).addTo(m);
      const satelite = Lf.layerGroup([
        Lf.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles &copy; Esri' }),
        Lf.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }),
      ]);
      const capaPuntos = Lf.layerGroup().addTo(m);
      const capaEtiquetas = Lf.layerGroup().addTo(m);
      capas.current = { mapa: calle, satelite, puntos: capaPuntos, etiquetas: capaEtiquetas };

      for (const p of puntos) {
        const c = Lf.circleMarker([p.latitud, p.longitud], { radius: 6, weight: 1.5, color: '#fff', fillColor: COLOR[categoria(p)], fillOpacity: 0.95 });
        c.bindTooltip(
          `<strong>${escapar(etiquetaDe(p))}</strong><br>${fmtTelefono(p.telefono)}${p.zona ? ` · ${escapar(p.zona)}` : ''}<br>` +
          `${ESTADO_TEXTO[categoria(p)]}${p.alertas_activas ? '' : ' · sin alertas'}<br><span style="opacity:.7">${p.latitud.toFixed(5)}, ${p.longitud.toFixed(5)}</span>`,
          { direction: 'top', offset: [0, -6] });
        c.on('click', () => {
          if (ref.current.herramienta !== 'mano') return;
          setSel((prev) => { const n = new Set(prev); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; });
        });
        marcadores.current.set(p.id, c);
      }
      if (puntos.length) m.fitBounds(Lf.latLngBounds(puntos.map((p) => [p.latitud, p.longitud] as [number, number])), { padding: [40, 40], maxZoom: 13 });

      // Rectángulo: arrastrar
      let inicio: Leaflet.LatLng | null = null;
      let rect: Leaflet.Rectangle | null = null;
      m.on('mousedown', (e: Leaflet.LeafletMouseEvent) => {
        if (ref.current.herramienta !== 'rect') return;
        inicio = e.latlng;
        rect = Lf.rectangle(Lf.latLngBounds(inicio, inicio), { color: SELECCION, weight: 2, dashArray: '6 4', fillOpacity: 0.12, interactive: false }).addTo(m);
      });
      m.on('mousemove', (e: Leaflet.LeafletMouseEvent) => { if (inicio && rect) rect.setBounds(Lf.latLngBounds(inicio, e.latlng)); });
      const soltar = () => {
        if (!inicio || !rect) return;
        const b = rect.getBounds();
        rect.remove(); rect = null; inicio = null;
        if (b.getNorthEast().equals(b.getSouthWest())) return; // fue un clic, no un arrastre
        aplicarRef.current(ref.current.filtrados.filter((p) => b.contains([p.latitud, p.longitud])).map((p) => p.id), 'el rectángulo');
      };
      m.on('mouseup', soltar);
      m.on('mouseout', soltar);

      // Zona: un clic por vértice; doble clic cierra
      m.on('click', (e: Leaflet.LeafletMouseEvent) => {
        if (ref.current.herramienta !== 'zona') return;
        const d = dibujo.current;
        d.puntos.push(e.latlng);
        if (!d.forma) d.forma = Lf.polygon(d.puntos, { color: SELECCION, weight: 2, dashArray: '6 4', fillOpacity: 0.12, interactive: false }).addTo(m);
        else d.forma.setLatLngs(d.puntos);
        setVertices(d.puntos.length);
      });
      m.on('dblclick', () => { if (ref.current.herramienta === 'zona') terminarRef.current(); });

      m.on('moveend', () => setVista((v) => v + 1));
      mapa.current = m;
      setListo(true);
    });
    return () => {
      cancelado = true;
      mapa.current?.remove();
      mapa.current = null;
      marcadores.current.clear();
    };
  }, [puntos]);

  // Herramienta: arrastrar el mapa solo con la mano
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    if (herramienta === 'rect') m.dragging.disable(); else m.dragging.enable();
    if (herramienta === 'zona') m.doubleClickZoom.disable(); else m.doubleClickZoom.enable();
    if (herramienta !== 'zona') cancelarZona();
    m.getContainer().classList.toggle(s.dibujando!, herramienta !== 'mano');
  }, [herramienta, listo]);

  // Capa base
  useEffect(() => {
    const m = mapa.current; const c = capas.current;
    if (!m || !c) return;
    if (capa === 'satelite') { c.mapa.remove(); c.satelite.addTo(m); } else { c.satelite.remove(); c.mapa.addTo(m); }
    c.satelite.eachLayer((x) => (x as Leaflet.TileLayer).bringToBack?.());
  }, [capa, listo]);

  // Puntos visibles según filtros + estilo de seleccionados
  useEffect(() => {
    const c = capas.current;
    if (!c) return;
    for (const p of puntos) {
      const mk = marcadores.current.get(p.id);
      if (!mk) continue;
      const visible = idsFiltrados.has(p.id);
      if (visible && !c.puntos.hasLayer(mk)) c.puntos.addLayer(mk);
      if (!visible && c.puntos.hasLayer(mk)) c.puntos.removeLayer(mk);
      const elegido = sel.has(p.id);
      mk.setStyle(elegido
        ? { radius: 8, weight: 3, color: SELECCION, fillColor: COLOR[categoria(p)] }
        : { radius: 6, weight: 1.5, color: '#fff', fillColor: COLOR[categoria(p)] });
      if (elegido && visible) mk.bringToFront();
    }
  }, [puntos, idsFiltrados, sel, listo]);

  // Etiquetas (nombre o coordenadas) de los puntos que se ven
  const enVista = useMemo(() => {
    const m = mapa.current;
    if (!m) return filtrados;
    const b = m.getBounds();
    return filtrados.filter((p) => b.contains([p.latitud, p.longitud]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtrados, vista, listo]);
  const muchasEtiquetas = nombres && enVista.length > MAX_ETIQUETAS;

  useEffect(() => {
    const c = capas.current; const Lf = L.current;
    if (!c || !Lf) return;
    c.etiquetas.clearLayers();
    if (!nombres || enVista.length > MAX_ETIQUETAS) return;
    for (const p of enVista) {
      Lf.tooltip({ permanent: true, direction: 'right', offset: [7, 0], className: cn(s.etiqueta, sel.has(p.id) && s.etiquetaSel), interactive: false })
        .setLatLng([p.latitud, p.longitud]).setContent(escapar(etiquetaDe(p))).addTo(c.etiquetas);
    }
  }, [enVista, nombres, sel]);

  // ------------------------------------------------------------ Selección
  const seleccionados = useMemo(() => puntos.filter((p) => sel.has(p.id)), [puntos, sel]);
  const ocultos = seleccionados.filter((p) => !idsFiltrados.has(p.id)).length;
  const porZona = useMemo(() => agruparZonas(seleccionados).sort((a, b) => b.n - a.n), [seleccionados]);

  function irA(p: PuntoMapa) {
    mapa.current?.flyTo([p.latitud, p.longitud], Math.max(mapa.current.getZoom(), 14), { duration: 0.6 });
    marcadores.current.get(p.id)?.openTooltip();
  }
  function encuadrar(lista: PuntoMapa[]) {
    const m = mapa.current; const Lf = L.current;
    if (!m || !Lf || !lista.length) return;
    m.fitBounds(Lf.latLngBounds(lista.map((p) => [p.latitud, p.longitud] as [number, number])), { padding: [40, 40], maxZoom: 14 });
  }

  // ------------------------------------------------------------ Exportar
  const filas = () => {
    const origen = window.location.origin;
    return seleccionados.map((p) => ({
      id: p.id, nombre: p.nombre ?? '', telefono: p.telefono, zona: p.zona ?? '', estado: ESTADO_TEXTO[categoria(p)],
      vence_el: p.vence_el, dias_restantes: p.dias_restantes, alertas: p.alertas_activas ? 'Activas' : 'Desactivadas',
      latitud: p.latitud, longitud: p.longitud, registro: p.fecha_registro,
      radar: `${origen}/radar/${p.id}`, google_maps: `https://www.google.com/maps?q=${p.latitud},${p.longitud}`,
    }));
  };
  const COLUMNAS: [keyof ReturnType<typeof filas>[number], string, number][] = [
    ['id', 'ID', 7], ['nombre', 'Nombre', 28], ['telefono', 'Teléfono', 15], ['zona', 'Zona', 18], ['estado', 'Estado', 11],
    ['vence_el', 'Vence el', 11], ['dias_restantes', 'Días restantes', 9], ['alertas', 'Alertas', 12],
    ['latitud', 'Latitud', 11], ['longitud', 'Longitud', 11], ['registro', 'Registro', 11], ['radar', 'Radar', 34], ['google_maps', 'Google Maps', 44],
  ];
  const nombreArchivo = (ext: string) => `clientes-mapa-${new Date().toISOString().slice(0, 10)}-${seleccionados.length}.${ext}`;

  function descargarExcel() {
    iniciarExport(async () => {
      try {
        const { default: writeExcelFile } = await import('write-excel-file/universal');
        const blob = await writeExcelFile(filas(), {
          columns: COLUMNAS.map(([k, titulo, ancho]) => ({
            header: { value: titulo, fontWeight: 'bold' as const },
            cell: (f: ReturnType<typeof filas>[number]) => ({ value: f[k] }),
            width: ancho,
          })),
          sheet: 'Clientes',
        }).toBlob();
        descargar(blob, nombreArchivo('xlsx'));
      } catch (err) {
        toast.error(`No se pudo generar el Excel: ${(err as Error).message}`);
      }
    });
  }
  function descargarCsv() {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lineas = [COLUMNAS.map(([, t]) => esc(t)).join(','), ...filas().map((f) => COLUMNAS.map(([k]) => esc(f[k])).join(','))];
    descargar(new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' }), nombreArchivo('csv'));
  }
  function crearDifusion() {
    const f = filas();
    const archivo: ArchivoContactos = {
      nombre: `Mapa de clientes · ${f.length} seleccionado${f.length === 1 ? '' : 's'}`,
      columnas: ['telefono', 'nombre', 'nombre_o_productor', 'zona', 'estado', 'vence_el', 'radar', 'latitud', 'longitud'],
      filas: f.map((x) => ({
        telefono: x.telefono, nombre: x.nombre, nombre_o_productor: x.nombre || 'Productor', zona: x.zona, estado: x.estado,
        vence_el: x.vence_el, radar: x.radar, latitud: String(x.latitud), longitud: String(x.longitud),
      })),
    };
    try {
      sessionStorage.setItem(CLAVE_DESDE_MAPA, JSON.stringify(archivo));
    } catch {
      toast.error('El navegador no permitió pasar los contactos. Descarga el Excel y cárgalo en la difusión.');
      return;
    }
    router.push('/panel/campanas/nueva?desde=mapa');
  }

  // ------------------------------------------------------------ Vista
  const btnHerr = (h: Herramienta, Icono: typeof HandIcon, titulo: string) => (
    <Button size="sm" variant={herramienta === h ? 'default' : 'ghost'} onClick={() => setHerramienta(h)} title={titulo} aria-pressed={herramienta === h}>
      <Icono /> <span className="hidden sm:inline">{titulo}</span>
    </Button>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      {/* Mapa */}
      <Card className="relative isolate self-start overflow-hidden p-0 lg:sticky lg:top-20">
        <div ref={contenedor} className="h-[62dvh] min-h-[420px] w-full lg:h-[calc(100dvh-12.5rem)]" />

        <div className="absolute top-3 left-3 z-[1000] flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-1 rounded-lg border bg-background/95 p-1 shadow-md">
          {btnHerr('mano', HandIcon, 'Mover / clic')}
          {btnHerr('rect', SquareDashedIcon, 'Rectángulo')}
          {btnHerr('zona', LassoSelectIcon, 'Dibujar zona')}
          <span className="mx-0.5 h-6 w-px bg-border" />
          <Button size="sm" variant={modo === 'agregar' ? 'secondary' : 'ghost'} onClick={() => setModo('agregar')} title="Lo que marques se agrega a la selección">
            <PlusIcon /> <span className="hidden sm:inline">Agregar</span>
          </Button>
          <Button size="sm" variant={modo === 'quitar' ? 'secondary' : 'ghost'} onClick={() => setModo('quitar')} title="Lo que marques se quita de la selección">
            <MinusIcon /> <span className="hidden sm:inline">Quitar</span>
          </Button>
          <span className="mx-0.5 h-6 w-px bg-border" />
          <Button size="icon" variant={nombres ? 'secondary' : 'ghost'} className="size-8" onClick={() => setNombres(!nombres)} title="Mostrar nombres" aria-pressed={nombres}>
            <TagIcon />
          </Button>
          <Button size="icon" variant="ghost" className="size-8" onClick={() => setCapa(capa === 'mapa' ? 'satelite' : 'mapa')} title={capa === 'mapa' ? 'Ver satélite' : 'Ver mapa'}>
            <LayersIcon />
          </Button>
          <Button size="icon" variant="ghost" className="size-8" onClick={() => encuadrar(filtrados)} title="Ver todos los puntos">
            <LocateFixedIcon />
          </Button>
        </div>

        {/* Ayuda de la herramienta */}
        <div className="pointer-events-none absolute top-16 right-3 left-3 z-[1000] flex justify-center sm:top-[4.25rem]">
          {herramienta === 'rect' && <Aviso>Arrastra sobre el mapa para {modo === 'agregar' ? 'seleccionar' : 'quitar'} los puntos del rectángulo.</Aviso>}
          {herramienta === 'zona' && (
            <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-lg border bg-background/95 px-3 py-2 text-sm shadow-md">
              <span>{vertices < 3 ? `Haz clic para marcar el borde de la zona (${vertices} punto${vertices === 1 ? '' : 's'})` : `${vertices} puntos · doble clic o`}</span>
              {vertices >= 3 && <Button size="sm" onClick={terminarZona}><CheckIcon /> Cerrar zona</Button>}
              {vertices > 0 && <Button size="sm" variant="outline" onClick={deshacerVertice}><Undo2Icon /> Deshacer</Button>}
              {vertices > 0 && <Button size="sm" variant="ghost" onClick={cancelarZona}><XIcon /> Cancelar</Button>}
            </div>
          )}
          {herramienta === 'mano' && muchasEtiquetas && <Aviso>Hay {enVista.length.toLocaleString('es-BO')} puntos a la vista: acerca el mapa para ver los nombres.</Aviso>}
        </div>

        {/* Leyenda */}
        <div className="absolute bottom-9 left-3 z-[1000] hidden flex-col gap-1 rounded-lg border bg-background/95 px-3 py-2 text-xs shadow-md sm:flex">
          {CATEGORIAS.map((c) => (
            <span key={c.id} className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: c.color }} />{c.label}</span>
          ))}
          <span className="flex items-center gap-2"><span className="size-2.5 rounded-full border-2" style={{ borderColor: SELECCION }} />Seleccionado</span>
        </div>
      </Card>

      {/* Panel lateral */}
      <div className="grid content-start gap-4">
        <Card className="grid gap-3 p-4">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nombre, teléfono o zona" className="pl-9" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIAS.map((c) => {
              const on = cats.has(c.id);
              return (
                <button key={c.id} type="button" aria-pressed={on}
                  onClick={() => setCats((prev) => { const n = new Set(prev); if (on) n.delete(c.id); else n.add(c.id); return n; })}
                  className={cn('flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition', on ? 'bg-secondary font-medium' : 'text-muted-foreground opacity-60')}>
                  <span className="size-2 rounded-full" style={{ background: c.color }} />{c.label}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NativeSelect value={zona} onChange={(e) => setZona(e.target.value)} aria-label="Zona">
              <option value="">Todas las zonas</option>
              {zonas.map((z) => <option key={z.clave} value={z.clave}>{z.nombre} ({z.n})</option>)}
            </NativeSelect>
            <NativeSelect value={alertas} onChange={(e) => setAlertas(e.target.value as typeof alertas)} aria-label="Alertas">
              <option value="todas">Con y sin alertas</option>
              <option value="con">Con alertas</option>
              <option value="sin">Sin alertas</option>
            </NativeSelect>
          </div>
          <p className="text-xs text-muted-foreground">
            {filtrados.length.toLocaleString('es-BO')} de {puntos.length.toLocaleString('es-BO')} en el mapa
            {sinUbicacion > 0 && <> · <Link href="/panel/usuarios" className="underline">{sinUbicacion} sin ubicación</Link> (no aparecen)</>}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={!filtrados.length} onClick={() => aplicar(filtrados.map((p) => p.id), 'los filtros', 'agregar')}>
              Seleccionar filtrados ({filtrados.length})
            </Button>
            <Button size="sm" variant="outline" disabled={!enVista.length} onClick={() => aplicar(enVista.map((p) => p.id), 'la vista', 'agregar')}>
              Los que se ven ({enVista.length})
            </Button>
          </div>
        </Card>

        <Card className="grid gap-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium">
              <span className="tabular-nums">{sel.size.toLocaleString('es-BO')}</span> seleccionado{sel.size === 1 ? '' : 's'}
            </p>
            {sel.size > 0 && <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}><XIcon /> Limpiar</Button>}
          </div>

          {sel.size === 0 ? (
            <p className="text-sm text-muted-foreground">
              Haz clic en los puntos, arrastra un <strong>rectángulo</strong> o <strong>dibuja una zona</strong> en el mapa. También puedes filtrar y usar «Seleccionar filtrados».
            </p>
          ) : (
            <>
              {ocultos > 0 && (
                <p className="text-xs text-estado-aviso">
                  {ocultos} seleccionado{ocultos === 1 ? '' : 's'} no se ve{ocultos === 1 ? '' : 'n'} con los filtros actuales (igual se incluye{ocultos === 1 ? '' : 'n'}).{' '}
                  <button type="button" className="underline" onClick={() => setSel(new Set([...sel].filter((id) => idsFiltrados.has(id))))}>Quitarlos</button>
                </p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {porZona.slice(0, 8).map((z) => (
                  <span key={z.clave} className="rounded-full bg-secondary px-2 py-0.5 text-xs">{z.nombre} <strong className="tabular-nums">{z.n}</strong></span>
                ))}
                {porZona.length > 8 && <span className="px-1 text-xs text-muted-foreground">+{porZona.length - 8} zonas</span>}
              </div>
              <div className="grid gap-2">
                <Button onClick={crearDifusion}><SendIcon /> Crear difusión con {sel.size}</Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={descargarExcel} disabled={exportando}>
                    {exportando ? <Loader2Icon className="animate-spin" /> : <FileSpreadsheetIcon />} Excel
                  </Button>
                  <Button variant="outline" onClick={descargarCsv}><DownloadIcon /> CSV</Button>
                </div>
              </div>
              <ul className="-mx-1 max-h-72 divide-y overflow-y-auto text-sm">
                {seleccionados.slice(0, 300).map((p) => (
                  <li key={p.id} className="flex items-center gap-2 px-1 py-1.5">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: COLOR[categoria(p)] }} />
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => irA(p)} title="Ver en el mapa">
                      <span className="block truncate font-medium">{etiquetaDe(p)}</span>
                      <span className="block truncate text-xs text-muted-foreground">{fmtTelefono(p.telefono)}{p.zona ? ` · ${p.zona}` : ''}</span>
                    </button>
                    <Link href={`/panel/usuarios/${p.id}`} className="shrink-0 text-xs text-primary hover:underline">Ficha</Link>
                    <Button size="icon" variant="ghost" className="size-7 shrink-0" aria-label="Quitar de la selección"
                      onClick={() => setSel((prev) => { const n = new Set(prev); n.delete(p.id); return n; })}>
                      <XIcon />
                    </Button>
                  </li>
                ))}
              </ul>
              {seleccionados.length > 300 && <p className="text-xs text-muted-foreground">Se muestran 300 de {seleccionados.length.toLocaleString('es-BO')}; se incluyen todos al exportar.</p>}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return <span className="rounded-lg border bg-background/95 px-3 py-2 text-center text-sm shadow-md">{children}</span>;
}

function escapar(t: string) {
  return t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
