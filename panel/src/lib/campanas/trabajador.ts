import 'server-only';
import { pool, query, registrarLog, sql } from '@/lib/db';
import { confChatwoot, ErrorChatwoot, type Conf } from '@/lib/chatwoot';
import { enviarPlantilla, mensajesDesde, prepararConversacion, renderizar } from '@/lib/campanas/chatwoot';

/**
 * Trabajador de difusiones (corre en segundo plano dentro del panel, ver instrumentation.ts):
 *  1. Pasa a "enviando" las difusiones cuya hora programada llegó.
 *  2. Envía los mensajes pendientes, de a uno, con una pausa entre cada uno.
 *  3. Consulta a Chatwoot el estado de lo enviado (entregado / leído / falló) y si respondió.
 *     El webhook de Chatwoot hace lo mismo al instante; esto es el respaldo.
 */

const ENVIO_MS = 25_000;        // tiempo máximo enviando por ciclo
const SEGUIMIENTO_MAX = 60;     // conversaciones revisadas por ciclo
const MAX_INTENTOS = 3;
const BLOQUEO = 4_201_011;      // pg_advisory_lock: un solo trabajador aunque haya más de un proceso

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function cicloDifusiones(): Promise<{ enviados: number; revisados: number } | null> {
  const cliente = await pool.connect();
  try {
    const { rows } = await cliente.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1) AS ok', [BLOQUEO]);
    if (!rows[0]?.ok) return null;
    try {
      await activarProgramadas();
      const conf = await confChatwoot();
      if ('error' in conf) return { enviados: 0, revisados: 0 };
      const enviados = await enviarPendientes(conf);
      const revisados = await seguimiento(conf);
      return { enviados, revisados };
    } finally {
      await cliente.query('SELECT pg_advisory_unlock($1)', [BLOQUEO]);
    }
  } finally {
    cliente.release();
  }
}

async function activarProgramadas() {
  await query(sql`
    UPDATE bot_clima.campanas SET estado = 'enviando', iniciada_el = COALESCE(iniciada_el, now())
     WHERE estado = 'programada' AND programada_para <= now()`);
  // Un envío que quedó a medias (el panel se reinició justo mientras enviaba) no se repite: podría duplicarse
  await query(sql`
    UPDATE bot_clima.campana_destinatarios
       SET estado = 'fallido', error = 'Interrumpido mientras se enviaba (el panel se reinició). Revisa en Chatwoot si llegó.', actualizado_el = now()
     WHERE estado = 'enviando' AND actualizado_el < now() - interval '10 minutes'`);
}

type Destinatario = {
  id: number; campana_id: number; telefono: string; nombre: string | null; parametros: Record<string, string>; intentos: number;
  inbox_id: number; plantilla_nombre: string; plantilla_idioma: string; plantilla_categoria: string | null; plantilla_cuerpo: string;
};

async function enviarPendientes(conf: Conf) {
  const [cfg] = await query<{ pausa: number }>(sql`SELECT bot_clima.cfg_num('difusion_pausa_ms', 1200)::int AS pausa`);
  const pausa = Math.max(cfg?.pausa ?? 1200, 200);
  const limite = Date.now() + ENVIO_MS;
  let enviados = 0;

  while (Date.now() < limite) {
    // Toma el siguiente pendiente de la difusión más antigua que esté enviando
    const [d] = await query<Destinatario>(sql`
      UPDATE bot_clima.campana_destinatarios d SET estado = 'enviando', actualizado_el = now()
        FROM bot_clima.campanas c
       WHERE c.id = d.campana_id
         AND d.id = (SELECT x.id FROM bot_clima.campana_destinatarios x
                       JOIN bot_clima.campanas k ON k.id = x.campana_id
                      WHERE k.estado = 'enviando' AND x.estado = 'pendiente'
                      ORDER BY k.programada_para, k.id, x.id
                      LIMIT 1 FOR UPDATE OF x SKIP LOCKED)
      RETURNING d.id, d.campana_id, d.telefono, d.nombre, d.parametros, d.intentos,
                c.inbox_id, c.plantilla_nombre, c.plantilla_idioma, c.plantilla_categoria, c.plantilla_cuerpo`);
    if (!d) break;

    // Pidió no recibir mensajes después de crearse la difusión: no se le envía
    const [baja] = await query<{ x: number }>(sql`SELECT 1 AS x FROM bot_clima.bajas_whatsapp WHERE telefono = ${d.telefono}`);
    if (baja) {
      await query(sql`UPDATE bot_clima.campana_destinatarios SET estado = 'fallido', error = 'Pidió no recibir mensajes (Dejar de recibir)', actualizado_el = now() WHERE id = ${d.id}`);
      continue;
    }

    try {
      const { contactoId, conversacionId } = await prepararConversacion(conf, d.inbox_id, d.telefono, d.nombre);
      const mensajeId = await enviarPlantilla(conf, conversacionId, {
        nombre: d.plantilla_nombre, idioma: d.plantilla_idioma, categoria: d.plantilla_categoria,
        parametros: d.parametros, contenido: renderizar(d.plantilla_cuerpo, d.parametros),
      });
      await query(sql`
        UPDATE bot_clima.campana_destinatarios
           SET estado = 'enviado', error = NULL, enviado_el = now(), actualizado_el = now(),
               chatwoot_contact_id = ${contactoId}, chatwoot_conversation_id = ${conversacionId}, chatwoot_message_id = ${mensajeId}
         WHERE id = ${d.id}`);
      enviados++;
    } catch (err) {
      const e = err as Error;
      // 429 / 5xx / sin conexión: pasajero → se reintenta en el próximo ciclo (hasta MAX_INTENTOS)
      const pasajero = !(e instanceof ErrorChatwoot) || e.estado === 429 || e.estado >= 500;
      const reintentar = pasajero && d.intentos + 1 < MAX_INTENTOS;
      await query(sql`
        UPDATE bot_clima.campana_destinatarios
           SET estado = ${reintentar ? 'pendiente' : 'fallido'}, intentos = intentos + 1,
               error = ${e.message.slice(0, 500)}, actualizado_el = now()
         WHERE id = ${d.id}`);
      if (reintentar) break; // Chatwoot con problemas: se espera al próximo ciclo
    }
    await dormir(pausa);
  }

  // Difusiones que ya no tienen nada por enviar
  const terminadas = await query<{ id: number; nombre: string }>(sql`
    UPDATE bot_clima.campanas c SET estado = 'enviada', finalizada_el = now()
     WHERE c.estado = 'enviando'
       AND NOT EXISTS (SELECT 1 FROM bot_clima.campana_destinatarios x WHERE x.campana_id = c.id AND x.estado IN ('pendiente', 'enviando'))
    RETURNING c.id, c.nombre`);
  for (const t of terminadas) await registrarLog('info', 'difusiones', `Difusión terminada: ${t.nombre}`, { campana_id: t.id });
  return enviados;
}

// ---------------------------------------------------------------- Estados
const RANGO: Record<string, number> = { pendiente: 0, enviando: 1, enviado: 2, entregado: 3, leido: 4 };
const DE_CHATWOOT: Record<string, string> = { sent: 'enviado', delivered: 'entregado', read: 'leido', failed: 'fallido' };

/** Aplica el estado que informa Chatwoot sin retroceder (un "entregado" tardío no pisa un "leído") */
export async function aplicarEstado(destinatarioId: number, estadoActual: string, estadoCw: string | undefined, error?: string | null) {
  const nuevo = estadoCw ? DE_CHATWOOT[estadoCw] : undefined;
  if (!nuevo || nuevo === estadoActual) return;
  if (nuevo === 'fallido') {
    if (estadoActual === 'leido') return;
    await query(sql`UPDATE bot_clima.campana_destinatarios SET estado = 'fallido', error = ${error ?? 'WhatsApp no pudo entregar el mensaje'}, actualizado_el = now()
                    WHERE id = ${destinatarioId}`);
    return;
  }
  if ((RANGO[nuevo] ?? 0) <= (RANGO[estadoActual] ?? 0)) return;
  await query(sql`
    UPDATE bot_clima.campana_destinatarios
       SET estado = ${nuevo}, actualizado_el = now(),
           entregado_el = CASE WHEN ${nuevo} IN ('entregado', 'leido') THEN COALESCE(entregado_el, now()) ELSE entregado_el END,
           leido_el     = CASE WHEN ${nuevo} = 'leido' THEN COALESCE(leido_el, now()) ELSE leido_el END
     WHERE id = ${destinatarioId}`);
}

export async function aplicarRespuesta(destinatarioId: number, fecha: Date, texto: string | null) {
  await query(sql`
    UPDATE bot_clima.campana_destinatarios
       SET respondio_el = COALESCE(respondio_el, ${fecha.toISOString()}::timestamptz),
           respuesta = COALESCE(respuesta, ${texto ? texto.slice(0, 200) : null}),
           -- si respondió, lo vio: cuenta como leído aunque WhatsApp no haya mandado el aviso
           estado = CASE WHEN estado IN ('enviado', 'entregado') THEN 'leido' ELSE estado END,
           leido_el = COALESCE(leido_el, ${fecha.toISOString()}::timestamptz),
           actualizado_el = now()
     WHERE id = ${destinatarioId}`);
}

const esEntrante = (t: number | string) => t === 0 || t === 'incoming';
const fechaDe = (v: number | string) => new Date(typeof v === 'number' ? v * 1000 : v);

async function seguimiento(conf: Conf) {
  const filas = await query<{ id: number; estado: string; conversacion: number; mensaje: number; enviado_el: string }>(sql`
    SELECT id, estado, chatwoot_conversation_id AS conversacion, chatwoot_message_id AS mensaje, enviado_el
      FROM bot_clima.campana_destinatarios
     WHERE estado IN ('enviado', 'entregado', 'leido') AND chatwoot_message_id IS NOT NULL
       AND enviado_el > now() - interval '3 days'
       AND NOT (estado = 'leido' AND respondio_el IS NOT NULL)
       AND (revisado_el IS NULL OR revisado_el < now() - interval '5 minutes')
     ORDER BY revisado_el NULLS FIRST
     LIMIT ${SEGUIMIENTO_MAX}`);
  for (const f of filas) {
    try {
      const msgs = await mensajesDesde(conf, f.conversacion, f.mensaje);
      const propio = msgs.find((m) => m.id === f.mensaje);
      if (propio) await aplicarEstado(f.id, f.estado, propio.status);
      const resp = msgs.find((m) => esEntrante(m.message_type) && !m.private && m.id > f.mensaje);
      if (resp) await aplicarRespuesta(f.id, fechaDe(resp.created_at), resp.content);
    } catch (err) {
      console.error('[difusiones] seguimiento', f.id, (err as Error).message);
    }
    await query(sql`UPDATE bot_clima.campana_destinatarios SET revisado_el = now() WHERE id = ${f.id}`);
  }
  return filas.length;
}
