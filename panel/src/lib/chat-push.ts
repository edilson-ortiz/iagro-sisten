import 'server-only';
import webpush from 'web-push';
import { query, sql } from '@/lib/db';
import { rutaChat } from '@/lib/chat-web';

/**
 * Notificaciones push del chat web. Cada navegador que acepta las notificaciones guarda su
 * suscripción en bot_clima.chat_web_push; cuando el bot o un agente responde en Chatwoot,
 * el webhook del panel llama a notificarChat() y le llega el aviso aunque tenga el chat cerrado.
 */

export type Suscripcion = { endpoint: string; keys: { p256dh: string; auth: string } };

let claves: { publica: string; privada: string } | null = null;

/** Claves VAPID del servidor: se generan la primera vez y quedan en la base */
export async function clavesVapid() {
  if (claves) return claves;
  let [c] = await query<{ publica: string; privada: string }>(sql`SELECT publica, privada FROM bot_clima.chat_web_vapid WHERE id = 1`);
  if (!c) {
    const n = webpush.generateVAPIDKeys();
    await query(sql`INSERT INTO bot_clima.chat_web_vapid (id, publica, privada) VALUES (1, ${n.publicKey}, ${n.privateKey}) ON CONFLICT DO NOTHING`);
    [c] = await query<{ publica: string; privada: string }>(sql`SELECT publica, privada FROM bot_clima.chat_web_vapid WHERE id = 1`);
  }
  claves = c;
  return c;
}

export async function guardarSuscripcion(tel: string, s: Suscripcion, navegador: string | null) {
  await query(sql`
    INSERT INTO bot_clima.chat_web_push (telefono, endpoint, p256dh, auth, navegador)
    VALUES (${tel}, ${s.endpoint}, ${s.keys.p256dh}, ${s.keys.auth}, ${navegador?.slice(0, 200) ?? null})
    ON CONFLICT (endpoint) DO UPDATE SET telefono = EXCLUDED.telefono, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
                                         navegador = EXCLUDED.navegador`);
}

export async function borrarSuscripcion(tel: string, endpoint: string) {
  await query(sql`DELETE FROM bot_clima.chat_web_push WHERE telefono = ${tel} AND endpoint = ${endpoint}`);
}

/** Texto del aviso: sin el formato de WhatsApp (*negrita*, _cursiva_…) y corto */
function resumen(texto: string | null, adjunto: string | null) {
  const limpio = (texto ?? '').replace(/\*\*?([^*\n]+)\*\*?/g, '$1').replace(/_([^_\n]+)_/g, '$1').replace(/~([^~\n]+)~/g, '$1').trim();
  if (limpio) return limpio.length > 180 ? `${limpio.slice(0, 177)}…` : limpio;
  return adjunto === 'image' ? '📷 Imagen' : adjunto === 'location' ? '📍 Ubicación' : adjunto ? '📎 Archivo' : 'Nuevo mensaje';
}

/** Avisa a todos los navegadores suscritos de ese teléfono; borra los que ya no existen (404/410) */
export async function notificarChat(telefono: string, texto: string | null, adjunto: string | null = null) {
  const tel = telefono.replace(/\D/g, '');
  const subs = await query<{ id: number; endpoint: string; p256dh: string; auth: string }>(sql`
    SELECT id, endpoint, p256dh, auth FROM bot_clima.chat_web_push WHERE telefono = ${tel}`);
  if (!subs.length) return;

  const { publica, privada } = await clavesVapid();
  const datos = JSON.stringify({ titulo: 'IAGRO Clima', texto: resumen(texto, adjunto), url: rutaChat(tel) });

  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, datos, {
        vapidDetails: { subject: 'https://iagro360.xyz', publicKey: publica, privateKey: privada },
        TTL: 12 * 3600, urgency: 'high', timeout: 10_000,
      });
      await query(sql`UPDATE bot_clima.chat_web_push SET ultimo_envio_el = now() WHERE id = ${s.id}`);
    } catch (err) {
      const estado = (err as { statusCode?: number }).statusCode;
      if (estado === 404 || estado === 410) await query(sql`DELETE FROM bot_clima.chat_web_push WHERE id = ${s.id}`);
      else console.error('[chat push]', estado ?? '', (err as Error).message);
    }
  }));
}
