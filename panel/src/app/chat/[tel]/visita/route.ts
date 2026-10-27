import { NextResponse } from 'next/server';
import { query, sql } from '@/lib/db';
import { firmaValida } from '@/lib/chat-web';

/**
 * POST /chat/{tel}/visita { k, instalada, plataforma }: cada vez que se abre el chat.
 * instalada = se abrió desde la app instalada o acaba de instalarla. Lo muestra el panel → App y notificaciones.
 */
export const dynamic = 'force-dynamic';

const PLATAFORMAS = new Set(['android', 'ios', 'pc']);

export async function POST(req: Request, { params }: { params: Promise<{ tel: string }> }) {
  const { tel } = await params;
  let cuerpo: { k?: string; instalada?: boolean; plataforma?: string };
  try { cuerpo = await req.json(); } catch { return NextResponse.json({ error: 'Solicitud no válida.' }, { status: 400 }); }
  if (!firmaValida(tel, cuerpo.k)) return NextResponse.json({ error: 'Enlace no válido.' }, { status: 401 });
  const plataforma = PLATAFORMAS.has(cuerpo.plataforma ?? '') ? cuerpo.plataforma! : null;
  const instalada = cuerpo.instalada === true;
  try {
    await query(sql`
      INSERT INTO bot_clima.chat_web_clientes AS c (telefono, plataforma, instalada_el)
      VALUES (${tel}, ${plataforma}, CASE WHEN ${instalada}::boolean THEN now() END)
      ON CONFLICT (telefono) DO UPDATE SET
        ultima_visita_el = now(),
        -- Recargar la página no cuenta como otra visita (30 min entre una y otra)
        visitas = c.visitas + CASE WHEN c.ultima_visita_el < now() - interval '30 minutes' THEN 1 ELSE 0 END,
        plataforma = COALESCE(EXCLUDED.plataforma, c.plataforma),
        instalada_el = COALESCE(c.instalada_el, EXCLUDED.instalada_el)`);
  } catch (err) {
    console.error('[chat web] visita', (err as Error).message);
  }
  return NextResponse.json({ ok: true });
}
