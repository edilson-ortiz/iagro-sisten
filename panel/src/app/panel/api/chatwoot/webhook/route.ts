import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { query, sql } from '@/lib/db';
import { aplicarEstado, aplicarRespuesta } from '@/lib/campanas/trabajador';
import { confChatWeb } from '@/lib/chat-web';
import { notificarChat } from '@/lib/chat-push';

/**
 * Webhook de Chatwoot (Configuración → Integraciones → Webhooks), eventos "Mensaje creado" y "Mensaje actualizado".
 * URL: https://<sitio>/panel/api/chatwoot/webhook?token=<chatwoot_webhook_token>
 * Actualiza al instante el estado de las difusiones (entregado / leído / falló) y quién respondió,
 * y avisa por notificación push al cliente del chat web cuando el bot o un agente le responde.
 */
type Evento = {
  event?: string; id?: number; message_type?: string | number; status?: string; private?: boolean;
  content?: string | null; created_at?: string | number;
  conversation?: { id?: number; inbox_id?: number; meta?: { sender?: { phone_number?: string | null } } };
  inbox?: { id?: number }; attachments?: { file_type?: string }[];
  content_attributes?: { external_error?: string } | null;
};

/** Respuesta nueva en una conversación del chat web → notificación al navegador del cliente */
async function avisarChatWeb(e: Evento) {
  const tel = e.conversation?.meta?.sender?.phone_number?.replace(/\D/g, '');
  if (e.event !== 'message_created' || !tel) return;
  const c = await confChatWeb();
  if ('error' in c || (e.inbox?.id ?? e.conversation?.inbox_id) !== c.inbox) return;
  await notificarChat(tel, e.content ?? null, e.attachments?.[0]?.file_type ?? null);
}

async function tokenValido(recibido: string | null) {
  if (!recibido) return false;
  const [r] = await query<{ token: string | null }>(sql`SELECT bot_clima.cfg_texto('chatwoot_webhook_token', '') AS token`);
  const esperado = Buffer.from(r?.token ?? '');
  const dado = Buffer.from(recibido);
  return esperado.length > 0 && esperado.length === dado.length && timingSafeEqual(esperado, dado);
}

export async function POST(req: Request) {
  if (!(await tokenValido(new URL(req.url).searchParams.get('token')))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  let e: Evento;
  try { e = await req.json(); } catch { return NextResponse.json({ ok: true }); }
  if (e.private || (e.event !== 'message_created' && e.event !== 'message_updated')) return NextResponse.json({ ok: true });

  try {
    const saliente = e.message_type === 'outgoing' || e.message_type === 1 || e.message_type === 'template' || e.message_type === 3;
    if (saliente && e.id) {
      // Estado de un mensaje de difusión
      const [d] = await query<{ id: number; estado: string }>(sql`
        SELECT id, estado FROM bot_clima.campana_destinatarios WHERE chatwoot_message_id = ${e.id}`);
      if (d) await aplicarEstado(d.id, d.estado, e.status, e.content_attributes?.external_error ?? null);
      await avisarChatWeb(e);
    } else if (e.event === 'message_created' && (e.message_type === 'incoming' || e.message_type === 0) && e.conversation?.id) {
      // Respuesta del contacto: se asigna a la última difusión que recibió en esa conversación (últimos 3 días)
      const [d] = await query<{ id: number }>(sql`
        SELECT id FROM bot_clima.campana_destinatarios
         WHERE chatwoot_conversation_id = ${e.conversation.id} AND respondio_el IS NULL
           AND enviado_el > now() - interval '3 days'
         ORDER BY enviado_el DESC LIMIT 1`);
      if (d) {
        const f = e.created_at ? new Date(typeof e.created_at === 'number' ? e.created_at * 1000 : e.created_at) : new Date();
        await aplicarRespuesta(d.id, Number.isNaN(f.getTime()) ? new Date() : f, e.content ?? null);
      }
    }
  } catch (err) {
    console.error('[webhook chatwoot]', (err as Error).message);
  }
  return NextResponse.json({ ok: true });
}
