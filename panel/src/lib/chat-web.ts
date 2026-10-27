import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { query, sql } from '@/lib/db';
import { buscarContacto, cw, ErrorChatwoot, type Conf } from '@/lib/chatwoot';

/**
 * Chat web (/chat/{teléfono}?k=firma): conversación en un inbox de Chatwoot de tipo API.
 * El cliente escribe como mensaje "incoming" y el bot de n8n responde a esa conversación
 * (lo identifica por el teléfono del contacto, igual que en WhatsApp).
 * La firma k impide que alguien cambie el número del enlace y lea el chat de otro.
 */

export type BotonChat = { titulo: string; valor: string };
export type AdjuntoChat = { tipo: string; url: string | null; miniatura: string | null; nombre: string | null; lat: number | null; lon: number | null };
export type MensajeChat = {
  id: number; mio: boolean; texto: string | null; hora: number; estado: string;
  botones: BotonChat[]; adjuntos: AdjuntoChat[];
};

type CwAdjunto = {
  file_type?: string; data_url?: string | null; thumb_url?: string | null; fallback_title?: string | null;
  coordinates_lat?: number | null; coordinates_long?: number | null;
};
type CwMensaje = {
  id: number; content: string | null; message_type: number | string; created_at: number | string;
  private?: boolean; status?: string; content_type?: string;
  content_attributes?: { items?: { title?: string; value?: string }[] } | null;
  attachments?: CwAdjunto[];
};

export const telefonoValido = (t: string) => /^\d{8,15}$/.test(t);

function secreto() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET debe tener al menos 32 caracteres (ver .env.example).');
  return s;
}

export const firmaChat = (tel: string) => createHmac('sha256', secreto()).update(`chat-web:${tel}`).digest('base64url').slice(0, 12);

export function firmaValida(tel: string, k: string | null | undefined) {
  if (!telefonoValido(tel) || !k) return false;
  const esperado = Buffer.from(firmaChat(tel));
  const dado = Buffer.from(k);
  return esperado.length === dado.length && timingSafeEqual(esperado, dado);
}

/** Ruta del chat de un teléfono (relativa: el sitio público es parte de esta misma app) */
export const rutaChat = (telefono: string) => {
  const tel = telefono.replace(/\D/g, '');
  return `/chat/${tel}?k=${firmaChat(tel)}`;
};

// La configuración se lee como mucho una vez por minuto (el chat consulta cada pocos segundos)
let confCache: { conf: Conf | { error: string }; hasta: number } | null = null;

export async function confChatWeb(): Promise<Conf | { error: string }> {
  if (confCache && confCache.hasta > Date.now()) return confCache.conf;
  const token = process.env.CHATWOOT_API_TOKEN?.trim();
  const [c] = await query<{ url: string; cuenta: string; inbox: string }>(sql`
    SELECT bot_clima.cfg_texto('chatwoot_url_publica', '') AS url, bot_clima.cfg_texto('chatwoot_account_id', '') AS cuenta,
           bot_clima.cfg_texto('chatwoot_web_inbox_id', '0') AS inbox`);
  const conf: Conf | { error: string } =
    !token ? { error: 'Falta CHATWOOT_API_TOKEN en el .env del panel.' }
    : !c?.url || !c.cuenta ? { error: 'Falta la URL o la cuenta de Chatwoot (Configuración → WhatsApp y Chatwoot).' }
    : !(Number(c.inbox) > 0) ? { error: 'El chat web está apagado: falta el ID del inbox del chat web (Configuración → WhatsApp y Chatwoot).' }
    : { base: `${c.url.replace(/\/+$/, '')}/api/v1/accounts/${c.cuenta}`, token, inbox: Number(c.inbox), plantillas: [] };
  confCache = { conf, hasta: Date.now() + 60_000 };
  return conf;
}

// Conversación de cada teléfono en el inbox del chat web (se recuerda 10 min; en curso = una sola búsqueda a la vez)
const conversaciones = new Map<string, { id: number; hasta: number }>();
const enCurso = new Map<string, Promise<number>>();

async function nombreCliente(tel: string) {
  const [u] = await query<{ nombre: string | null }>(sql`SELECT nombre FROM bot_clima.usuarios WHERE telefono = ${tel} LIMIT 1`);
  return u?.nombre?.trim() || null;
}

async function buscarOCrearConversacion(c: Conf, tel: string): Promise<number> {
  let contacto = await buscarContacto(c, tel);
  if (!contacto) {
    const r = await cw<{ payload: { contact: { id: number } } }>(c, '/contacts', {
      cuerpo: { name: (await nombreCliente(tel)) ?? `+${tel}`, phone_number: `+${tel}` },
    });
    contacto = r.payload.contact.id;
  }

  const convs = await cw<{ payload: { id: number; inbox_id: number; last_activity_at?: number }[] }>(c, `/contacts/${contacto}/conversations`);
  const propia = convs.payload
    .filter((x) => x.inbox_id === c.inbox)
    .sort((a, b) => (b.last_activity_at ?? 0) - (a.last_activity_at ?? 0))[0];
  if (propia) return propia.id;

  const ci = await cw<{ source_id: string }>(c, `/contacts/${contacto}/contact_inboxes`, { cuerpo: { inbox_id: c.inbox } });
  const conv = await cw<{ id: number }>(c, '/conversations', {
    cuerpo: { source_id: ci.source_id, inbox_id: c.inbox, contact_id: contacto, status: 'open' },
  });
  return conv.id;
}

async function conversacion(c: Conf, tel: string): Promise<number> {
  const guardada = conversaciones.get(tel);
  if (guardada && guardada.hasta > Date.now()) return guardada.id;
  let p = enCurso.get(tel);
  if (!p) {
    p = buscarOCrearConversacion(c, tel).finally(() => enCurso.delete(tel));
    enCurso.set(tel, p);
  }
  const id = await p;
  conversaciones.set(tel, { id, hasta: Date.now() + 10 * 60_000 });
  return id;
}

/** Ejecuta con la conversación del teléfono; si la borraron en Chatwoot (404), la busca de nuevo una vez */
async function conConversacion<T>(c: Conf, tel: string, fn: (conv: number) => Promise<T>): Promise<T> {
  try {
    return await fn(await conversacion(c, tel));
  } catch (err) {
    if (!(err instanceof ErrorChatwoot) || err.estado !== 404) throw err;
    conversaciones.delete(tel);
    return fn(await conversacion(c, tel));
  }
}

const epoch = (v: number | string) => (typeof v === 'number' ? v * 1000 : new Date(v).getTime());

function aMensaje(m: CwMensaje): MensajeChat | null {
  // 0 entrante (cliente), 1 saliente (bot/agente), 3 plantilla; 2 = actividad ("conversación resuelta"…) no se muestra
  const tipo = m.message_type;
  if (m.private || tipo === 2 || tipo === 'activity') return null;
  const items = m.content_type === 'input_select' ? m.content_attributes?.items ?? [] : [];
  const adjuntos = (m.attachments ?? []).map((a) => ({
    tipo: a.file_type ?? 'file', url: a.data_url ?? null, miniatura: a.thumb_url || null, nombre: a.fallback_title ?? null,
    lat: a.coordinates_lat ?? null, lon: a.coordinates_long ?? null,
  }));
  if (!m.content && !adjuntos.length && !items.length) return null;
  return {
    id: m.id,
    mio: tipo === 0 || tipo === 'incoming',
    texto: m.content,
    hora: epoch(m.created_at),
    estado: m.status ?? 'sent',
    botones: items.filter((i) => i.title).map((i) => ({ titulo: i.title!, valor: i.value ?? i.title! })),
    adjuntos,
  };
}

/** Últimos mensajes (de a 20, como entrega Chatwoot); con `antes` trae los anteriores a ese id. `mas`: quedan más viejos */
export async function mensajesChat(c: Conf, tel: string, antes?: number): Promise<{ mensajes: MensajeChat[]; mas: boolean }> {
  return conConversacion(c, tel, async (conv) => {
    const r = await cw<{ payload: CwMensaje[] }>(c, `/conversations/${conv}/messages${antes ? `?before=${antes}` : ''}`);
    return {
      mensajes: r.payload.map(aMensaje).filter((m): m is MensajeChat => m !== null).sort((a, b) => a.id - b.id),
      mas: r.payload.length >= 20,
    };
  });
}

/** Mensaje del cliente: entra a Chatwoot como "incoming" y dispara el webhook del bot */
export async function enviarChat(c: Conf, tel: string, texto: string): Promise<MensajeChat | null> {
  return conConversacion(c, tel, async (conv) => {
    const m = await cw<CwMensaje>(c, `/conversations/${conv}/messages`, {
      cuerpo: { content: texto, message_type: 'incoming', private: false },
    });
    return aMensaje(m);
  });
}
