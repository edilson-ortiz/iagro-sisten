import { obtenerSesion } from '@/lib/auth';
import { destinatariosParaExportar, obtenerCampana } from '@/lib/datos-campanas';

const ESTADOS: Record<string, string> = {
  pendiente: 'Pendiente', enviando: 'Enviando', enviado: 'Enviado', entregado: 'Entregado', leido: 'Leído', fallido: 'Falló',
};
const campo = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const fecha = (v: string | null) => (v ? new Date(v).toLocaleString('sv-SE', { timeZone: 'America/La_Paz' }) : '');

/** CSV con el estado de cada contacto (respeta la búsqueda y el filtro de la tabla) */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await obtenerSesion())) return new Response('No autorizado', { status: 401 });
  const id = Number((await params).id);
  const c = Number.isInteger(id) ? await obtenerCampana(id) : null;
  if (!c) return new Response('No encontrada', { status: 404 });

  const sp = new URL(req.url).searchParams;
  const filas = await destinatariosParaExportar(id, { q: sp.get('q') ?? undefined, estado: sp.get('estado') ?? undefined });
  const variables = Object.keys(c.mapeo.variables ?? {});
  const cab = ['Telefono', 'Nombre', ...variables.map((v) => `Variable ${v}`), 'Estado', 'Enviado', 'Entregado', 'Leido',
    'Respondio', 'Respuesta', 'Error', 'Conversacion Chatwoot'];
  const lineas = filas.map((f) => [
    f.telefono, f.nombre, ...variables.map((v) => f.parametros[v]), ESTADOS[f.estado] ?? f.estado,
    fecha(f.enviado_el), fecha(f.entregado_el), fecha(f.leido_el), fecha(f.respondio_el), f.respuesta, f.error, f.chatwoot_conversation_id,
  ].map(campo).join(','));
  const csv = '﻿' + [cab.join(','), ...lineas].join('\r\n'); // BOM: Excel abre bien los acentos
  const nombre = c.nombre.normalize('NFD').replace(/[^\w-]+/g, '_').slice(0, 60) || `difusion_${id}`;
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nombre}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
