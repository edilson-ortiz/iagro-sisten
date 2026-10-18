import 'server-only';
import { query, sql } from '@/lib/db';

/**
 * Cliente mínimo de la API de Chatwoot (solo lectura) para contar mensajes salientes.
 * Token: variable de entorno CHATWOOT_API_TOKEN (Chatwoot → Perfil → Token de acceso).
 * URL y cuenta: Configuración → WhatsApp y Chatwoot.
 */

export type Conf = { base: string; token: string; inbox: number; plantillas: RegExp[] };

// Tipos de mensaje de Chatwoot: 0 entrante, 1 saliente, 2 actividad, 3 plantilla
const SALIENTES = new Set([1, 3, 'outgoing', 'template']);

type CwMensaje = {
  id: number;
  content: string | null;
  message_type: number | string;
  created_at: number | string;
  private?: boolean;
  status?: string;
  content_attributes?: Record<string, unknown> | null;
  additional_attributes?: Record<string, unknown> | null;
};

export type MensajeSaliente = {
  id: number; conversacion: number; enviado_el: string; plantilla: boolean; estado: string; contenido: string | null;
};

export async function confChatwoot(): Promise<Conf | { error: string }> {
  const token = process.env.CHATWOOT_API_TOKEN?.trim();
  if (!token) return { error: 'Falta la variable CHATWOOT_API_TOKEN en el .env del panel.' };
  const [c] = await query<{ url: string; cuenta: string; inbox: string }>(sql`
    SELECT bot_clima.cfg_texto('chatwoot_url_publica', '') AS url, bot_clima.cfg_texto('chatwoot_account_id', '') AS cuenta,
           bot_clima.cfg_texto('chatwoot_inbox_id', '0') AS inbox`);
  if (!c?.url || !c.cuenta) return { error: 'Falta la URL o la cuenta de Chatwoot (Configuración → WhatsApp y Chatwoot).' };
  const conf: Conf = { base: `${c.url.replace(/\/+$/, '')}/api/v1/accounts/${c.cuenta}`, token, inbox: Number(c.inbox) || 0, plantillas: [] };
  conf.plantillas = await plantillasWhatsApp(conf).catch(() => []);
  return conf;
}

const normalizar = (t: string) => t.replace(/\s+/g, ' ').trim();

/**
 * La API de Chatwoot no marca qué mensaje fue una plantilla (lo devuelve como texto común).
 * Se reconoce comparando el contenido con el texto de las plantillas aprobadas del inbox de WhatsApp:
 * "Hola {{1}} 👋 Aviso de lluvia para *{{2}}*…" → /^Hola [\s\S]*? 👋 Aviso de lluvia para \*[\s\S]*?\*…/
 */
async function plantillasWhatsApp(c: Conf): Promise<RegExp[]> {
  type Inbox = { id: number; channel_type: string; message_templates?: { components?: { type: string; text?: string }[] }[] };
  const r = await cw<{ payload: Inbox[] }>(c, '/inboxes');
  return r.payload
    .filter((i) => i.channel_type === 'Channel::Whatsapp' && (!c.inbox || i.id === c.inbox))
    .flatMap((i) => i.message_templates ?? [])
    .map((t) => t.components?.find((x) => x.type === 'BODY')?.text ?? '')
    .filter((cuerpo) => normalizar(cuerpo.replace(/\{\{\w+\}\}/g, '')).length >= 15) // evita plantillas casi vacías que coinciden con todo
    .map((cuerpo) => new RegExp(`^${normalizar(cuerpo)
      .split(/\{\{\w+\}\}/)
      .map((parte) => parte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('[\\s\\S]*?')}`));
}

const esPlantilla = (c: Conf, contenido: string | null) => !!contenido && c.plantillas.some((r) => r.test(normalizar(contenido)));

/** Llamada a la API de Chatwoot (GET por defecto; con cuerpo → POST JSON) */
export async function cw<T>(c: Conf, ruta: string, opciones: { metodo?: 'GET' | 'POST'; cuerpo?: unknown } = {}): Promise<T> {
  const metodo = opciones.metodo ?? (opciones.cuerpo !== undefined ? 'POST' : 'GET');
  const res = await fetch(`${c.base}${ruta}`, {
    method: metodo,
    headers: {
      api_access_token: c.token, accept: 'application/json',
      ...(opciones.cuerpo !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: opciones.cuerpo !== undefined ? JSON.stringify(opciones.cuerpo) : undefined,
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 401) throw new Error('Chatwoot rechazó el token (401). Revisa CHATWOOT_API_TOKEN.');
  if (!res.ok) {
    // Chatwoot explica el motivo en el cuerpo (ej: plantilla inválida, número sin WhatsApp)
    const detalle = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 250);
    throw new ErrorChatwoot(res.status, `Chatwoot respondió ${res.status} en ${metodo} ${ruta.split('?')[0]}${detalle ? `: ${detalle}` : ''}`);
  }
  return res.json() as Promise<T>;
}

export class ErrorChatwoot extends Error {
  constructor(public estado: number, mensaje: string) { super(mensaje); }
}

const digitos = (t: string | null | undefined) => (t ?? '').replace(/\D/g, '');
const epoch = (v: number | string) => (typeof v === 'number' ? v * 1000 : new Date(v).getTime());

/** Recorta sin partir emojis: un emoji partido deja un "surrogate" suelto y Postgres rechaza el JSON */
const recortar = (t: string | null, max: number) =>
  t ? Array.from(t).slice(0, max).join('').replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '') : null;

/** Busca el contacto por teléfono (para usuarios aún no vinculados) */
export async function buscarContacto(c: Conf, telefono: string): Promise<number | null> {
  const tel = digitos(telefono);
  if (tel.length < 8) return null;
  const r = await cw<{ payload: { id: number; phone_number: string | null }[] }>(c, `/contacts/search?q=${tel}`);
  const hit = r.payload.find((x) => {
    const d = digitos(x.phone_number);
    return d && (d === tel || d.endsWith(tel) || tel.endsWith(d));
  });
  return hit?.id ?? null;
}

/** Mensajes salientes del contacto entre [desde, hasta) */
export async function salientesDeContacto(c: Conf, contactoId: number, desde: number, hasta: number): Promise<MensajeSaliente[]> {
  const convs = await cw<{ payload: { id: number; inbox_id: number; last_activity_at?: number }[] }>(c, `/contacts/${contactoId}/conversations`);
  const salida: MensajeSaliente[] = [];

  for (const conv of convs.payload) {
    if (c.inbox && conv.inbox_id !== c.inbox) continue;
    if (conv.last_activity_at && conv.last_activity_at * 1000 < desde) continue; // sin actividad en el mes

    // Chatwoot entrega de a 20 mensajes, del más nuevo al más viejo con ?before=
    let antes: number | null = null;
    for (let pagina = 0; pagina < 200; pagina++) {
      const r: { payload: CwMensaje[] } = await cw(c, `/conversations/${conv.id}/messages${antes ? `?before=${antes}` : ''}`);
      if (!r.payload.length) break;
      for (const m of r.payload) {
        const t = epoch(m.created_at);
        if (t < desde || t >= hasta || m.private || !SALIENTES.has(m.message_type)) continue;
        const attrs = { ...m.content_attributes, ...m.additional_attributes };
        salida.push({
          id: m.id,
          conversacion: conv.id,
          enviado_el: new Date(t).toISOString(),
          plantilla: m.message_type === 3 || m.message_type === 'template' || 'template_params' in attrs || esPlantilla(c, m.content),
          estado: m.status ?? 'sent',
          contenido: recortar(m.content, 200),
        });
      }
      const masViejo = r.payload.reduce((a, m) => (m.id < a.id ? m : a));
      if (epoch(masViejo.created_at) < desde || r.payload.length < 20) break;
      antes = masViejo.id;
    }
  }
  return salida;
}
