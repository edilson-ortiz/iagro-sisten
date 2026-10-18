'use server';

import { revalidatePath } from 'next/cache';
import { requerirSesion } from '@/lib/auth';
import { query, registrarLog, sql } from '@/lib/db';
import { buscarContacto, confChatwoot, salientesDeContacto } from '@/lib/chatwoot';
import { mesesConsumo, rangoMes } from '@/lib/datos-consumo';
import type { Resultado } from '@/app/panel/(app)/usuarios/actions';

const EN_PARALELO = 4;

/** Copia desde Chatwoot los mensajes salientes del mes de cada usuario */
export async function sincronizarConsumo(mes: string): Promise<Resultado> {
  const sesion = await requerirSesion();
  if (!(await mesesConsumo()).includes(mes)) return { ok: false, error: 'Mes inválido.' };

  const cfg = await confChatwoot();
  if ('error' in cfg) return { ok: false, error: cfg.error };
  const conf = cfg;

  const inicio = Date.now();
  const { desde, hasta } = await rangoMes(mes);
  // Además del mes elegido, cubre el ciclo actual de cada usuario (puede empezar el mes anterior)
  const usuarios = await query<{
    id: number; nombre: string | null; telefono: string; chatwoot_contact_id: number | null; ciclo_desde: number; ciclo_hasta: number;
  }>(sql`
    SELECT u.id, u.nombre, u.telefono, u.chatwoot_contact_id,
           (extract(epoch FROM c.inicio::timestamp AT TIME ZONE t.z) * 1000)::bigint AS ciclo_desde,
           (extract(epoch FROM c.fin::timestamp AT TIME ZONE t.z) * 1000)::bigint AS ciclo_hasta
      FROM bot_clima.usuarios u
      CROSS JOIN (SELECT bot_clima.cfg_texto('zona_horaria', 'America/La_Paz') AS z) t
      LEFT JOIN LATERAL bot_clima.ciclo_tokens(u.id) c ON true
     ORDER BY u.id`);

  let mensajes = 0;
  let sinContacto = 0;
  const errores: { usuario_id: number; nombre: string | null; error: string }[] = [];

  async function procesar(u: (typeof usuarios)[number]) {
    try {
      let contacto = u.chatwoot_contact_id;
      if (!contacto) {
        contacto = await buscarContacto(conf, u.telefono);
        if (!contacto) { sinContacto++; return; }
        await query(sql`
          UPDATE bot_clima.usuarios SET chatwoot_contact_id = ${contacto}
           WHERE id = ${u.id} AND NOT EXISTS (SELECT 1 FROM bot_clima.usuarios x WHERE x.chatwoot_contact_id = ${contacto})`);
      }
      const lista = await salientesDeContacto(conf, contacto,
        Math.min(desde, Number(u.ciclo_desde) || desde), Math.max(hasta, Number(u.ciclo_hasta) || hasta));
      if (lista.length) {
        await query(sql`
          INSERT INTO bot_clima.mensajes_salientes AS m
                 (chatwoot_message_id, usuario_id, chatwoot_conversation_id, enviado_el, plantilla, estado, contenido)
          SELECT x.id, ${u.id}, x.conversacion, x.enviado_el, x.plantilla, x.estado, x.contenido
            FROM jsonb_to_recordset(${JSON.stringify(lista)}::jsonb)
                 AS x(id bigint, conversacion bigint, enviado_el timestamptz, plantilla boolean, estado text, contenido text)
          ON CONFLICT (chatwoot_message_id) DO UPDATE
             SET estado = EXCLUDED.estado, plantilla = EXCLUDED.plantilla, sincronizado_el = now()`);
      }
      mensajes += lista.length;
    } catch (err) {
      // Drizzle envuelve el error de Postgres: la causa real está en .cause
      const e = err as Error & { cause?: Error };
      errores.push({ usuario_id: u.id, nombre: u.nombre, error: (e.cause?.message ?? e.message).slice(0, 300) });
    }
  }

  // Si el token es inválido falla el primero: se corta sin recorrer a todos
  const cola = [...usuarios];
  const primero = cola.shift();
  if (primero) await procesar(primero);
  if (errores[0]?.error.includes('401')) return { ok: false, error: errores[0].error };
  await Promise.all(Array.from({ length: EN_PARALELO }, async () => {
    for (let u = cola.shift(); u; u = cola.shift()) await procesar(u);
  }));

  const duracion = Date.now() - inicio;
  try {
    await query(sql`
      INSERT INTO bot_clima.consumo_sincronizaciones (mes, duracion_ms, usuarios, mensajes, errores, admin_id)
      VALUES (to_date(${mes} || '-01', 'YYYY-MM-DD'), ${duracion}, ${usuarios.length}, ${mensajes},
              ${JSON.stringify(errores)}::jsonb, ${sesion.adminId})`);
    await registrarLog(errores.length ? 'aviso' : 'info', 'panel:consumo', 'Consumo sincronizado desde Chatwoot',
      { mes, usuarios: usuarios.length, mensajes, sinContacto, errores: errores.length, admin: sesion.usuario });
  } catch (err) {
    return { ok: false, error: `No se pudo guardar la sincronización: ${(err as Error).message}` };
  }

  revalidatePath('/panel/consumo');
  const partes = [`${mensajes} mensaje(s) saliente(s) de ${usuarios.length - sinContacto} usuario(s)`];
  if (sinContacto) partes.push(`${sinContacto} sin contacto en Chatwoot`);
  if (errores.length) partes.push(`${errores.length} con error`);
  return errores.length && errores.length === usuarios.length - sinContacto
    ? { ok: false, error: `No se pudo leer Chatwoot: ${errores[0]!.error}` }
    : { ok: true, mensaje: `Sincronizado: ${partes.join(' · ')}.` };
}
