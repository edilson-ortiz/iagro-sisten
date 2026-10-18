import 'server-only';
import { cw, type Conf } from '@/lib/chatwoot';

/** Plantilla de WhatsApp tal como la tiene Chatwoot (sincronizada desde Meta) */
export type Plantilla = {
  inboxId: number;
  inbox: string;
  nombre: string;
  idioma: string;
  categoria: string;
  estado: string;
  cabecera: string | null;      // texto del encabezado (si es de texto)
  cuerpo: string;
  pie: string | null;
  botones: string[];
  variables: string[];          // en orden: ["1","2"] o nombres si es NAMED
  soportada: boolean;
  motivo?: string;              // por qué no se puede usar desde el panel
};

type Componente = { type: string; format?: string; text?: string; buttons?: { type: string; text: string; url?: string }[] };
type InboxCw = {
  id: number; name: string; channel_type: string;
  message_templates?: { name: string; language: string; category: string; status: string; components?: Componente[] }[];
};

const VARIABLE = /\{\{\s*([\w.]+)\s*\}\}/g;
const variablesDe = (texto: string) => [...new Set([...texto.matchAll(VARIABLE)].map((m) => m[1]!))];

/** Plantillas de los inbox de WhatsApp (nunca devuelve provider_config: trae la clave de Meta) */
export async function plantillasWhatsApp(c: Conf): Promise<Plantilla[]> {
  const r = await cw<{ payload: InboxCw[] }>(c, '/inboxes');
  return r.payload
    .filter((i) => i.channel_type === 'Channel::Whatsapp')
    .flatMap((i) => (i.message_templates ?? []).map((t): Plantilla => {
      const comp = (tipo: string) => t.components?.find((x) => x.type === tipo);
      const cab = comp('HEADER');
      const cuerpo = comp('BODY')?.text ?? '';
      const botones = comp('BUTTONS')?.buttons ?? [];
      let motivo: string | undefined;
      if (t.status !== 'APPROVED') motivo = `Estado en Meta: ${t.status}`;
      else if (cab && cab.format && cab.format !== 'TEXT') motivo = `Encabezado con ${cab.format.toLowerCase()} (aún no soportado)`;
      else if (cab?.text && variablesDe(cab.text).length) motivo = 'Encabezado con variables (aún no soportado)';
      else if (botones.some((b) => b.url?.includes('{{'))) motivo = 'Botón con URL variable (aún no soportado)';
      return {
        inboxId: i.id, inbox: i.name, nombre: t.name, idioma: t.language, categoria: t.category, estado: t.status,
        cabecera: cab?.format === 'TEXT' || (!cab?.format && cab?.text) ? cab?.text ?? null : null,
        cuerpo, pie: comp('FOOTER')?.text ?? null, botones: botones.map((b) => b.text),
        variables: variablesDe(cuerpo), soportada: !motivo, motivo,
      };
    }))
    .sort((a, b) => Number(b.soportada) - Number(a.soportada) || a.nombre.localeCompare(b.nombre));
}

/** Pide a Chatwoot que vuelva a traer las plantillas desde Meta */
export async function sincronizarPlantillas(c: Conf, inboxIds: number[]) {
  for (const id of inboxIds) await cw(c, `/inboxes/${id}/sync_templates`, { metodo: 'POST', cuerpo: {} });
}

/** Texto final de la plantilla con los valores (lo que verá el cliente; también se guarda en Chatwoot) */
export function renderizar(cuerpo: string, valores: Record<string, string>) {
  return cuerpo.replace(VARIABLE, (_, k: string) => valores[k] ?? `{{${k}}}`);
}

/** WhatsApp no acepta saltos de línea, tabulaciones ni más de 4 espacios seguidos en las variables */
export const limpiarVariable = (v: unknown) =>
  String(v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim().slice(0, 1000);

type ContactoCw = { id: number; phone_number?: string | null; contact_inboxes?: { source_id: string; inbox?: { id: number }; inbox_id?: number }[] };
const digitos = (t: string | null | undefined) => (t ?? '').replace(/\D/g, '');

/**
 * Deja listo el contacto en Chatwoot para enviarle: lo busca por teléfono (o lo crea),
 * lo vincula al inbox de WhatsApp y usa su conversación (o abre una nueva). Igual que el flujo de n8n.
 */
export async function prepararConversacion(c: Conf, inboxId: number, tel: string, nombre: string | null) {
  const busqueda = await cw<{ payload: ContactoCw[] }>(c, `/contacts/search?q=${tel}&include_contact_inboxes=true`);
  let contacto = busqueda.payload.find((x) => digitos(x.phone_number) === tel);
  if (!contacto) {
    const r = await cw<{ payload: { contact?: ContactoCw } & ContactoCw }>(c, '/contacts', {
      cuerpo: { inbox_id: inboxId, name: nombre || `+${tel}`, phone_number: `+${tel}` },
    });
    contacto = r.payload.contact ?? r.payload;
  }

  let sourceId = contacto.contact_inboxes?.find((x) => Number(x.inbox?.id ?? x.inbox_id) === inboxId)?.source_id;
  if (!sourceId) {
    const r = await cw<{ source_id: string }>(c, `/contacts/${contacto.id}/contact_inboxes`, { cuerpo: { inbox_id: inboxId, source_id: tel } });
    sourceId = r.source_id;
  }

  const convs = await cw<{ payload: { id: number; inbox_id: number; status: string; last_activity_at?: number }[] }>(
    c, `/contacts/${contacto.id}/conversations`);
  const orden: Record<string, number> = { open: 0, pending: 1, snoozed: 2, resolved: 3 };
  const conv = convs.payload
    .filter((x) => Number(x.inbox_id) === inboxId)
    .sort((a, b) => (orden[a.status] ?? 9) - (orden[b.status] ?? 9) || (b.last_activity_at ?? 0) - (a.last_activity_at ?? 0))[0];
  const conversacionId = conv?.id
    ?? (await cw<{ id: number }>(c, '/conversations', { cuerpo: { source_id: sourceId, inbox_id: inboxId, contact_id: contacto.id, status: 'open' } })).id;

  return { contactoId: contacto.id, conversacionId };
}

export async function enviarPlantilla(
  c: Conf, conversacionId: number,
  p: { nombre: string; idioma: string; categoria: string | null; parametros: Record<string, string>; contenido: string },
) {
  const r = await cw<{ id: number }>(c, `/conversations/${conversacionId}/messages`, {
    cuerpo: {
      content: p.contenido, message_type: 'outgoing', private: false,
      template_params: { name: p.nombre, category: p.categoria || 'UTILITY', language: p.idioma, processed_params: p.parametros },
    },
  });
  return r.id;
}

export type MensajeCw = { id: number; message_type: number | string; status?: string; created_at: number | string; content: string | null; private?: boolean };

/** Mensajes de la conversación a partir de uno (el de la difusión, para ver su estado y si respondió) */
export async function mensajesDesde(c: Conf, conversacionId: number, mensajeId: number) {
  const r = await cw<{ payload: MensajeCw[] }>(c, `/conversations/${conversacionId}/messages?after=${mensajeId - 1}`);
  return r.payload;
}
