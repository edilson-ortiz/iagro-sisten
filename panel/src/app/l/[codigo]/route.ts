import { query, sql } from '@/lib/db';
import { rutaChat } from '@/lib/chat-web';

/**
 * Enlace corto del botón "Ver pronóstico" de la plantilla de WhatsApp: /l/{codigo} → chat web del teléfono.
 * El código lo crea bot_clima.enlace_chat_web() (flujo de n8n "IAGRO · WhatsApp → Chat web").
 */
export const dynamic = 'force-dynamic';

// Redirección relativa: detrás del túnel el host interno no es el público
const ir = (ruta: string) => new Response(null, { status: 302, headers: { location: ruta, 'cache-control': 'no-store' } });

export async function GET(req: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  if (!/^[a-z0-9]{6,16}$/i.test(codigo)) return ir('/');
  const [e] = await query<{ telefono: string }>(sql`
    UPDATE bot_clima.chat_web_enlaces SET visitas = visitas + 1 WHERE codigo = ${codigo.toLowerCase()} RETURNING telefono`);
  if (!e) return ir('/');
  // ?r=CÓDIGO: llegó por la invitación de un amigo ("Quiero alertas IAgro CÓDIGO"); el chat se lo pasa al bot
  const r = new URL(req.url).searchParams.get('r') ?? '';
  return ir(rutaChat(e.telefono) + (/^[a-z0-9]{4,8}$/i.test(r) ? `&r=${r.toUpperCase()}` : ''));
}
