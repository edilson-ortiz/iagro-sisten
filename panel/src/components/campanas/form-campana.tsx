'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import {
  ArrowLeftIcon, CalendarClockIcon, ChevronLeftIcon, ChevronRightIcon, DownloadIcon, ListChecksIcon, FileSpreadsheetIcon, Loader2Icon, RefreshCwIcon, SendIcon, UploadIcon, XIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label, NativeSelect, Textarea } from '@/components/ui/input';
import { VistaPrevia } from '@/components/campanas/vista-previa';
import { actualizarPlantillas, crearCampana } from '@/app/panel/(app)/campanas/actions';
import type { Plantilla } from '@/lib/campanas/chatwoot';
import { normalizarTelefono } from '@/lib/campanas/telefono';
import { CLAVE_DESDE_MAPA, type ArchivoContactos } from '@/lib/campanas/desde-mapa';
import { cn } from '@/lib/utils';

type Archivo = { nombre: string; columnas: string[]; filas: Record<string, string>[] };
type Origen = { tipo: 'columna' | 'fijo'; valor: string };

const clave = (p: Plantilla) => `${p.inboxId}|${p.nombre}|${p.idioma}`;
const FIJO = '__fijo__';

/** Excel guarda los CSV en Windows-1252 (acentos rotos si se leen como UTF-8) */
async function textoDe(archivo: File) {
  const buf = await archivo.arrayBuffer();
  const utf8 = new TextDecoder('utf-8').decode(buf);
  return utf8.includes('�') ? new TextDecoder('windows-1252').decode(buf) : utf8.replace(/^﻿/, '');
}

function celda(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toLocaleDateString('es-BO', { timeZone: 'UTC' });
  return String(v).trim();
}

/** Nombres de columna únicos y no vacíos */
function columnasUnicas(crudas: unknown[]) {
  const usadas = new Map<string, number>();
  return crudas.map((h, i) => {
    let n = celda(h) || `Columna ${i + 1}`;
    const k = usadas.get(n.toLowerCase()) ?? 0;
    usadas.set(n.toLowerCase(), k + 1);
    if (k) n = `${n} (${k + 1})`;
    return n;
  });
}

async function leerArchivo(archivo: File): Promise<Archivo> {
  const ext = archivo.name.toLowerCase().split('.').pop();
  if (ext === 'csv' || ext === 'txt') {
    const r = Papa.parse<string[]>(await textoDe(archivo), { skipEmptyLines: 'greedy' });
    const [cab = [], ...resto] = r.data;
    const columnas = columnasUnicas(cab);
    return { nombre: archivo.name, columnas, filas: resto.map((f) => Object.fromEntries(columnas.map((c, i) => [c, celda(f[i])]))) };
  }
  if (ext === 'xlsx') {
    const { default: readXlsxFile } = await import('read-excel-file');
    const [cab = [], ...resto] = await readXlsxFile(archivo);
    const columnas = columnasUnicas(cab);
    return {
      nombre: archivo.name, columnas,
      filas: resto.map((f) => Object.fromEntries(columnas.map((c, i) => [c, celda(f[i])]))).filter((f) => Object.values(f).some(Boolean)),
    };
  }
  throw new Error('Usa un archivo .csv o .xlsx (Excel). Los .xls antiguos: ábrelos en Excel y guárdalos como .xlsx.');
}

const buscar = (columnas: string[], re: RegExp) => columnas.find((c) => re.test(c.normalize('NFD').replace(/[̀-ͯ]/g, ''))) ?? '';

/** Variables {{1}} o {{nombre}}: si hay una columna con ese nombre (o "variable_1"), se usa sola */
function mapeoInicial(variables: string[], columnas: string[], previo: Record<string, Origen>): Record<string, Origen> {
  return Object.fromEntries(variables.map((v) => {
    if (previo[v]) return [v, previo[v]];
    const col = columnas.find((c) => [v, `variable_${v}`, `variable${v}`, `var${v}`, `{{${v}}}`].includes(c.toLowerCase().trim()));
    return [v, col ? { tipo: 'columna', valor: col } : { tipo: 'columna', valor: '' }];
  }));
}

function ahoraLocal(minutos = 0) {
  const d = new Date(Date.now() + minutos * 60_000);
  d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function FormCampana({ plantillasIniciales, errorPlantillas }: { plantillasIniciales: Plantilla[]; errorPlantillas?: string }) {
  const router = useRouter();
  const entradaArchivo = useRef<HTMLInputElement>(null);
  const [plantillas, setPlantillas] = useState(plantillasIniciales);
  const [actualizando, iniciarActualizar] = useTransition();
  const [guardando, iniciarGuardar] = useTransition();

  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [sel, setSel] = useState(() => (plantillasIniciales.find((p) => p.soportada) ? clave(plantillasIniciales.find((p) => p.soportada)!) : ''));
  const [archivo, setArchivo] = useState<Archivo | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [colTel, setColTel] = useState('');
  const [colNombre, setColNombre] = useState('');
  const [vars, setVars] = useState<Record<string, Origen>>({});
  const [envio, setEnvio] = useState<'ahora' | 'programar'>('ahora');
  const [fecha, setFecha] = useState(() => ahoraLocal(60));
  const [ver, setVer] = useState(0);
  const [revision, setRevision] = useState(false);

  const plantilla = plantillas.find((p) => clave(p) === sel);
  const variables = plantilla?.variables ?? [];
  const mapeo = useMemo(() => mapeoInicial(variables, archivo?.columnas ?? [], vars), [variables, archivo, vars]);

  // Contactos resueltos y su validación
  const analisis = useMemo(() => {
    const filas = archivo?.filas ?? [];
    const vistos = new Set<string>();
    const validos: { telefono: string; nombre: string | null; valores: Record<string, string> }[] = [];
    let sinTel = 0; let vacios = 0; let repetidos = 0;
    for (const f of filas) {
      const tel = colTel ? normalizarTelefono(f[colTel]) : null;
      const valores = Object.fromEntries(variables.map((v) => {
        const o = mapeo[v]!;
        return [v, (o.tipo === 'fijo' ? o.valor : f[o.valor] ?? '').trim()];
      }));
      if (!tel) { sinTel++; continue; }
      if (Object.values(valores).some((x) => !x)) { vacios++; continue; }
      if (vistos.has(tel)) { repetidos++; continue; }
      vistos.add(tel);
      validos.push({ telefono: tel, nombre: colNombre ? f[colNombre]?.trim() || null : null, valores });
    }
    return { validos, sinTel, vacios, repetidos, total: filas.length };
  }, [archivo, colTel, colNombre, mapeo, variables]);

  const ejemplo = analisis.validos[Math.min(ver, Math.max(analisis.validos.length - 1, 0))];
  const sinMapear = variables.filter((v) => !mapeo[v]?.valor.trim());

  // Contactos elegidos en el Mapa de clientes (/panel/mapa → "Crear difusión")
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('desde') !== 'mapa') return;
    let a: ArchivoContactos | null = null;
    try {
      a = JSON.parse(sessionStorage.getItem(CLAVE_DESDE_MAPA) ?? 'null');
      sessionStorage.removeItem(CLAVE_DESDE_MAPA);
    } catch { /* sin datos */ }
    if (!a?.filas?.length) return;
    setArchivo(a);
    setColTel('telefono');
    setColNombre('nombre');
    setVars({});
    setVer(0);
    toast.success(`${a.filas.length.toLocaleString('es-BO')} contactos cargados desde el mapa`);
  }, []);

  async function cargar(file: File | undefined) {
    if (!file) return;
    setLeyendo(true);
    try {
      const a = await leerArchivo(file);
      if (!a.filas.length) throw new Error('El archivo no tiene filas debajo de los encabezados.');
      if (a.filas.length > 100_000) throw new Error(`El archivo tiene ${a.filas.length.toLocaleString('es-BO')} filas. Máximo 100.000 por difusión.`);
      setArchivo(a);
      setColTel(buscar(a.columnas, /tel|cel|phone|whats|numero|movil|contacto/i));
      setColNombre(buscar(a.columnas, /^(nombre|name|cliente|razon)/i));
      setVars({});
      setVer(0);
      toast.success(`${a.filas.length.toLocaleString('es-BO')} filas leídas de ${a.nombre}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLeyendo(false);
      if (entradaArchivo.current) entradaArchivo.current.value = '';
    }
  }

  function descargarModelo() {
    const cab = ['telefono', 'nombre', ...variables.map((v) => (/^\d+$/.test(v) ? `variable_${v}` : v))];
    const fila = ['59176098116', 'Juan Pérez', ...variables.map(() => '')];
    const csv = '﻿' + [cab, fila].map((f) => f.map((x) => `"${x}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    Object.assign(document.createElement('a'), { href: url, download: `modelo_${plantilla?.nombre ?? 'difusion'}.csv` }).click();
    URL.revokeObjectURL(url);
  }

  function actualizar() {
    iniciarActualizar(async () => {
      const r = await actualizarPlantillas();
      if ('error' in r) { toast.error(r.error); return; }
      setPlantillas(r.plantillas);
      if (!r.plantillas.some((p) => clave(p) === sel)) setSel(r.plantillas.find((p) => p.soportada) ? clave(r.plantillas.find((p) => p.soportada)!) : '');
      toast.success(`${r.plantillas.length} plantilla(s) actualizadas desde Meta.`);
    });
  }

  const errores = [
    !nombre.trim() && 'Escribe un nombre para la difusión.',
    !plantilla && 'Elige una plantilla.',
    plantilla && !plantilla.soportada && `La plantilla no se puede usar: ${plantilla.motivo}`,
    !archivo && 'Carga el archivo con los contactos.',
    archivo && !colTel && 'Elige la columna del teléfono.',
    archivo && sinMapear.length > 0 && `Falta asignar ${sinMapear.map((v) => `{{${v}}}`).join(', ')}.`,
    archivo && colTel && !sinMapear.length && !analisis.validos.length && 'Ningún contacto es válido.',
    envio === 'programar' && (!fecha || new Date(fecha).getTime() < Date.now() - 60_000) && 'La fecha programada ya pasó.',
  ].filter(Boolean) as string[];

  function crear() {
    if (errores.length || !plantilla) { toast.error(errores[0]); return; }
    iniciarGuardar(async () => {
      const r = await crearCampana({
        nombre, descripcion,
        plantilla: { inboxId: plantilla.inboxId, nombre: plantilla.nombre, idioma: plantilla.idioma },
        mapeo: { archivo: archivo?.nombre, telefono: colTel, nombre: colNombre || null, variables: mapeo },
        contactos: analisis.validos,
        programadaPara: envio === 'programar' ? new Date(fecha).toISOString() : null,
      });
      if (!r.ok) { toast.error(r.error); return; }
      toast.success(r.mensaje);
      router.push(`/panel/campanas/${r.id}`);
    });
  }

  const cuando = envio === 'ahora' ? 'ahora mismo' : `el ${new Date(fecha).toLocaleString('es-BO', { dateStyle: 'long', timeStyle: 'short' })}`;
  const irA = (r: boolean) => { setRevision(r); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_440px]">
      <div className="grid min-w-0 gap-4">
        {revision ? (
          <Revision
            contactos={analisis.validos} variables={variables} omitidos={analisis.total - analisis.validos.length}
            plantilla={plantilla?.nombre ?? ''} cuando={cuando} nombre={nombre} seleccionado={ver} onElegir={setVer}
            envio={envio} guardando={guardando} onVolver={() => irA(false)} onConfirmar={crear}
          />
        ) : (<>
        <Card>
          <CardHeader><CardTitle>1. Datos de la difusión</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="c-nombre">Nombre *</Label>
              <Input id="c-nombre" value={nombre} maxLength={150} placeholder="Ej: Aviso campaña de invierno" onChange={(e) => setNombre(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="c-desc">Descripción</Label>
              <Textarea id="c-desc" rows={2} value={descripcion} maxLength={500} placeholder="Para qué es y a quién va (solo interno)" onChange={(e) => setDescripcion(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>2. Plantilla</CardTitle>
              <CardDescription>Plantillas aprobadas por Meta, tal como las tiene Chatwoot.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={actualizar} disabled={actualizando}>
              {actualizando ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />} Actualizar desde Meta
            </Button>
          </CardHeader>
          <CardContent className="grid gap-3">
            {errorPlantillas && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{errorPlantillas}</p>}
            <div className="grid gap-2">
              <Label htmlFor="c-plantilla">Plantilla *</Label>
              <NativeSelect id="c-plantilla" value={sel} onChange={(e) => { setSel(e.target.value); setVars({}); }}>
                <option value="" disabled>Elige una plantilla…</option>
                {plantillas.map((p) => (
                  <option key={clave(p)} value={clave(p)} disabled={!p.soportada}>
                    {p.nombre} · {p.idioma} · {p.categoria.toLowerCase()}{p.soportada ? '' : ` — ${p.motivo}`}
                  </option>
                ))}
              </NativeSelect>
            </div>
            {plantilla && (
              <p className="text-xs text-muted-foreground">
                {variables.length ? <>Variables: {variables.map((v) => <code key={v} className="mr-1 rounded bg-muted px-1">{`{{${v}}}`}</code>)}</> : 'Sin variables.'}
                {' '}Inbox: {plantilla.inbox}.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>3. Contactos</CardTitle>
              <CardDescription>Archivo CSV o Excel (.xlsx) con una fila por contacto. Hasta 100.000 contactos.</CardDescription>
            </div>
            {plantilla && <Button variant="ghost" size="sm" onClick={descargarModelo}><DownloadIcon /> Modelo CSV</Button>}
          </CardHeader>
          <CardContent className="grid gap-4">
            <input ref={entradaArchivo} type="file" accept=".csv,.txt,.xlsx" className="hidden" onChange={(e) => cargar(e.target.files?.[0])} />
            {!archivo ? (
              <button
                type="button"
                onClick={() => entradaArchivo.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
                onDragLeave={() => setArrastrando(false)}
                onDrop={(e) => { e.preventDefault(); setArrastrando(false); cargar(e.dataTransfer.files[0]); }}
                className={cn('flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-10 text-sm text-muted-foreground transition-colors hover:bg-accent',
                  arrastrando && 'border-primary bg-accent')}
              >
                {leyendo ? <Loader2Icon className="size-6 animate-spin" /> : <UploadIcon className="size-6" />}
                <span><strong className="text-foreground">Elige un archivo</strong> o arrástralo aquí</span>
                <span className="text-xs">.csv o .xlsx · la primera fila debe tener los nombres de las columnas</span>
              </button>
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <FileSpreadsheetIcon className="size-5 shrink-0 text-primary" />
                  <span className="truncate font-medium">{archivo.nombre}</span>
                  <span className="shrink-0 text-muted-foreground">· {archivo.filas.length.toLocaleString('es-BO')} filas · {archivo.columnas.length} columnas</span>
                </span>
                <Button variant="ghost" size="icon" className="size-8" aria-label="Quitar archivo" onClick={() => setArchivo(null)}><XIcon /></Button>
              </div>
            )}

            {archivo && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="c-tel">Columna del teléfono *</Label>
                    <NativeSelect id="c-tel" value={colTel} onChange={(e) => setColTel(e.target.value)}>
                      <option value="">Elige…</option>
                      {archivo.columnas.map((c) => <option key={c} value={c}>{c}</option>)}
                    </NativeSelect>
                    <p className="text-xs text-muted-foreground">Celulares de 8 dígitos reciben el 591 adelante.</p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="c-nom">Columna del nombre (opcional)</Label>
                    <NativeSelect id="c-nom" value={colNombre} onChange={(e) => setColNombre(e.target.value)}>
                      <option value="">Sin nombre</option>
                      {archivo.columnas.map((c) => <option key={c} value={c}>{c}</option>)}
                    </NativeSelect>
                    <p className="text-xs text-muted-foreground">Se usa al crear el contacto en Chatwoot.</p>
                  </div>
                </div>

                {variables.length > 0 && (
                  <div className="grid gap-3 rounded-lg bg-muted/50 p-3">
                    <p className="text-sm font-medium">Variables de la plantilla</p>
                    {variables.map((v) => {
                      const o = mapeo[v]!;
                      return (
                        <div key={v} className="grid items-center gap-2 sm:grid-cols-[72px_1fr_1fr]">
                          <code className="text-sm">{`{{${v}}}`}</code>
                          <NativeSelect
                            aria-label={`Origen de {{${v}}}`}
                            value={o.tipo === 'fijo' ? FIJO : o.valor}
                            onChange={(e) => setVars({ ...mapeo, [v]: e.target.value === FIJO ? { tipo: 'fijo', valor: '' } : { tipo: 'columna', valor: e.target.value } })}
                          >
                            <option value="">Elige una columna…</option>
                            {archivo.columnas.map((c) => <option key={c} value={c}>Columna: {c}</option>)}
                            <option value={FIJO}>Texto fijo (igual para todos)</option>
                          </NativeSelect>
                          {o.tipo === 'fijo' && (
                            <Input aria-label={`Texto fijo para {{${v}}}`} value={o.valor} placeholder="Texto para todos" maxLength={1000}
                              onChange={(e) => setVars({ ...mapeo, [v]: { tipo: 'fijo', valor: e.target.value } })} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {colTel && (
                  <div className="flex flex-wrap gap-2 text-sm">
                    <span className="rounded-full bg-estado-pagado/10 px-3 py-1 font-medium text-estado-pagado">{analisis.validos.length.toLocaleString('es-BO')} válidos</span>
                    {analisis.sinTel > 0 && <span className="rounded-full bg-estado-vencido/10 px-3 py-1 text-estado-vencido">{analisis.sinTel.toLocaleString('es-BO')} sin teléfono válido</span>}
                    {analisis.vacios > 0 && <span className="rounded-full bg-estado-aviso/10 px-3 py-1 text-estado-aviso">{analisis.vacios.toLocaleString('es-BO')} con variables vacías</span>}
                    {analisis.repetidos > 0 && <span className="rounded-full bg-muted px-3 py-1 text-muted-foreground">{analisis.repetidos.toLocaleString('es-BO')} repetidos</span>}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>4. Envío</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {(['ahora', 'programar'] as const).map((v) => (
                <label key={v} className={cn('flex cursor-pointer items-start gap-3 rounded-lg border p-3', envio === v && 'border-primary bg-primary/5')}>
                  <input type="radio" name="envio" className="mt-1 accent-primary" checked={envio === v} onChange={() => setEnvio(v)} />
                  <span className="text-sm">
                    <span className="block font-medium">{v === 'ahora' ? 'Enviar ahora' : 'Programar'}</span>
                    <span className="text-muted-foreground">{v === 'ahora' ? 'Empieza en unos segundos.' : 'Se envía en la fecha y hora que elijas.'}</span>
                  </span>
                </label>
              ))}
            </div>
            {envio === 'programar' && (
              <div className="grid max-w-xs gap-2">
                <Label htmlFor="c-fecha">Fecha y hora</Label>
                <Input id="c-fecha" type="datetime-local" value={fecha} min={ahoraLocal()} onChange={(e) => setFecha(e.target.value)} />
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center justify-end gap-3">
          {errores.length > 0 && <span className="mr-auto text-sm text-muted-foreground">{errores[0]}</span>}
          <Button size="lg" onClick={() => irA(true)} disabled={errores.length > 0}>
            <ListChecksIcon /> Revisar contactos
            {analisis.validos.length > 0 && ` (${analisis.validos.length.toLocaleString('es-BO')})`}
          </Button>
        </div>
        </>)}
      </div>

      <Card className="lg:sticky lg:top-20">
        <CardHeader className="flex-row items-center justify-between gap-2">
          <div>
            <CardTitle>Vista previa</CardTitle>
            <CardDescription>
              {ejemplo ? <>Contacto {Math.min(ver, analisis.validos.length - 1) + 1} de {analisis.validos.length.toLocaleString('es-BO')}: +{ejemplo.telefono}</> : 'Así se verá en WhatsApp.'}
            </CardDescription>
          </div>
          {analisis.validos.length > 1 && (
            <div className="flex gap-1">
              <Button variant="outline" size="icon" className="size-8" aria-label="Contacto anterior" disabled={ver === 0} onClick={() => setVer((x) => Math.max(0, x - 1))}><ChevronLeftIcon /></Button>
              <Button variant="outline" size="icon" className="size-8" aria-label="Contacto siguiente" disabled={ver >= analisis.validos.length - 1} onClick={() => setVer((x) => x + 1)}><ChevronRightIcon /></Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {plantilla
            ? <VistaPrevia cabecera={plantilla.cabecera} cuerpo={plantilla.cuerpo} pie={plantilla.pie} botones={plantilla.botones} valores={ejemplo?.valores ?? {}} />
            : <p className="py-10 text-center text-sm text-muted-foreground">Elige una plantilla para verla.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

const VISIBLES = 100;

/** Paso final: lista de lo que se va a enviar (los primeros 100) y recién ahí el botón de enviar o programar */
function Revision({
  contactos, variables, omitidos, plantilla, cuando, nombre, seleccionado, onElegir, envio, guardando, onVolver, onConfirmar,
}: {
  contactos: { telefono: string; nombre: string | null; valores: Record<string, string> }[];
  variables: string[]; omitidos: number; plantilla: string; cuando: string; nombre: string;
  seleccionado: number; onElegir: (i: number) => void; envio: 'ahora' | 'programar'; guardando: boolean;
  onVolver: () => void; onConfirmar: () => void;
}) {
  const total = contactos.length.toLocaleString('es-BO');
  const resto = contactos.length - VISIBLES;
  return (
    <Card>
      <CardHeader>
        <CardTitle>5. Revisa antes de enviar</CardTitle>
        <CardDescription>
          <strong className="text-foreground">{nombre}</strong> · plantilla <code>{plantilla}</code> · <strong className="text-foreground">{total} contacto(s)</strong>,{' '}
          {envio === 'ahora' ? 'se envía ahora mismo' : <>programada para <strong className="text-foreground">{cuando.replace(/^el /, '')}</strong></>}.
          {omitidos > 0 && <> Se omitieron {omitidos.toLocaleString('es-BO')} fila(s) del archivo (teléfono inválido, variables vacías o repetidos).</>}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="max-h-[520px] overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Teléfono</th>
                <th className="px-3 py-2 font-medium">Nombre</th>
                {variables.map((v) => <th key={v} className="px-3 py-2 font-mono font-medium">{`{{${v}}}`}</th>)}
              </tr>
            </thead>
            <tbody>
              {contactos.slice(0, VISIBLES).map((c, i) => (
                <tr
                  key={c.telefono}
                  onClick={() => onElegir(i)}
                  className={cn('cursor-pointer border-t transition-colors hover:bg-accent', seleccionado === i && 'bg-primary/10')}
                  title="Ver su mensaje en la vista previa"
                >
                  <td className="px-3 py-2 text-muted-foreground tabular-nums">{i + 1}</td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">+{c.telefono}</td>
                  <td className="max-w-48 truncate px-3 py-2">{c.nombre ?? <span className="text-muted-foreground">—</span>}</td>
                  {variables.map((v) => <td key={v} className="max-w-56 truncate px-3 py-2" title={c.valores[v]}>{c.valores[v]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-muted-foreground">
          {resto > 0
            ? <>Se muestran los primeros {VISIBLES} de <strong className="text-foreground">{total}</strong> contactos cargados. Los otros {resto.toLocaleString('es-BO')} también se envían; después los ves todos en el detalle de la difusión.</>
            : <>Estos son todos los contactos cargados.</>}
          {' '}Toca una fila para ver su mensaje.
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <Button variant="ghost" onClick={onVolver} disabled={guardando}><ArrowLeftIcon /> Volver y editar</Button>
          <Button size="lg" onClick={onConfirmar} disabled={guardando}>
            {guardando ? <Loader2Icon className="animate-spin" /> : envio === 'ahora' ? <SendIcon /> : <CalendarClockIcon />}
            {envio === 'ahora' ? `Enviar ahora (${total})` : `Programar (${total})`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
