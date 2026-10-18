'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requerirSesion } from '@/lib/auth';
import { query, registrarLog, sql } from '@/lib/db';
import { confChatwoot } from '@/lib/chatwoot';
import { limpiarVariable, plantillasWhatsApp, sincronizarPlantillas, type Plantilla } from '@/lib/campanas/chatwoot';
import { normalizarTelefono } from '@/lib/campanas/telefono';
import type { Resultado } from '@/app/panel/(app)/usuarios/actions';

const MAX_CONTACTOS = 100_000;

/** Plantillas de WhatsApp de Chatwoot (las que se gestionan en Meta) */
export async function obtenerPlantillas(): Promise<{ plantillas: Plantilla[] } | { error: string }> {
  await requerirSesion();
  const conf = await confChatwoot();
  if ('error' in conf) return { error: conf.error };
  try {
    return { plantillas: await plantillasWhatsApp(conf) };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

/** Pide a Chatwoot que traiga de nuevo las plantillas desde Meta y devuelve la lista actualizada */
export async function actualizarPlantillas(): Promise<{ plantillas: Plantilla[] } | { error: string }> {
  const sesion = await requerirSesion();
  const conf = await confChatwoot();
  if ('error' in conf) return { error: conf.error };
  try {
    const inboxes = [...new Set((await plantillasWhatsApp(conf)).map((p) => p.inboxId))];
    await sincronizarPlantillas(conf, inboxes.length ? inboxes : conf.inbox ? [conf.inbox] : []);
    await new Promise((r) => setTimeout(r, 2500)); // Chatwoot sincroniza en segundo plano
    await registrarLog('info', 'panel:difusiones', 'Plantillas sincronizadas desde Meta', { admin: sesion.usuario });
    return { plantillas: await plantillasWhatsApp(conf) };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

const esquema = z.object({
  nombre: z.string().trim().min(2, 'El nombre es muy corto.').max(150),
  descripcion: z.string().trim().max(500).optional(),
  plantilla: z.object({ inboxId: z.number().int().positive(), nombre: z.string().min(1), idioma: z.string().min(1) }),
  mapeo: z.object({
    archivo: z.string().max(200).optional(),
    telefono: z.string().max(200),
    nombre: z.string().max(200).nullable(),
    variables: z.record(z.string(), z.object({ tipo: z.enum(['columna', 'fijo']), valor: z.string().max(1000) })),
  }),
  contactos: z.array(z.object({
    telefono: z.string().max(40),
    nombre: z.string().max(150).nullable(),
    valores: z.record(z.string(), z.string().max(2000)),
  })).min(1, 'No hay contactos para enviar.').max(MAX_CONTACTOS, `Máximo ${MAX_CONTACTOS.toLocaleString('es-BO')} contactos por difusión.`),
  programadaPara: z.string().datetime({ offset: true }).nullable(),
});

export async function crearCampana(entrada: z.input<typeof esquema>): Promise<Resultado & { id?: number }> {
  const sesion = await requerirSesion();
  const d = esquema.safeParse(entrada);
  if (!d.success) return { ok: false, error: d.error.issues[0]?.message ?? 'Datos inválidos.' };
  const e = d.data;

  // La plantilla se valida contra Chatwoot en el momento (texto, categoría y variables reales)
  const conf = await confChatwoot();
  if ('error' in conf) return { ok: false, error: conf.error };
  let plantilla: Plantilla | undefined;
  try {
    plantilla = (await plantillasWhatsApp(conf)).find(
      (p) => p.inboxId === e.plantilla.inboxId && p.nombre === e.plantilla.nombre && p.idioma === e.plantilla.idioma);
  } catch (err) {
    return { ok: false, error: `No se pudo leer Chatwoot: ${(err as Error).message}` };
  }
  if (!plantilla) return { ok: false, error: 'La plantilla ya no existe en Chatwoot. Actualiza las plantillas.' };
  if (!plantilla.soportada) return { ok: false, error: `Esta plantilla no se puede usar: ${plantilla.motivo}` };

  // Contactos: teléfono válido, sin repetidos y con todas las variables completas
  const vistos = new Set<string>();
  const filas: { telefono: string; nombre: string | null; parametros: Record<string, string> }[] = [];
  let invalidos = 0;
  let repetidos = 0;
  // Quien tocó "Dejar de recibir" no recibe difusiones (hasta que escriba ALTA)
  const bajas = new Set((await query<{ telefono: string }>(sql`SELECT telefono FROM bot_clima.bajas_whatsapp`)).map((b) => b.telefono));
  let deBaja = 0;
  for (const c of e.contactos) {
    const tel = normalizarTelefono(c.telefono);
    const parametros = Object.fromEntries(plantilla.variables.map((v) => [v, limpiarVariable(c.valores[v])]));
    if (!tel || Object.values(parametros).some((v) => !v)) { invalidos++; continue; }
    if (vistos.has(tel)) { repetidos++; continue; }
    if (bajas.has(tel)) { deBaja++; continue; }
    vistos.add(tel);
    filas.push({ telefono: tel, nombre: c.nombre?.trim().slice(0, 150) || null, parametros });
  }
  if (!filas.length) {
    return { ok: false, error: deBaja ? 'Todos los contactos válidos pidieron no recibir mensajes.' : 'Ningún contacto tiene un teléfono válido con todas las variables completas.' };
  }

  const cuando = e.programadaPara ? new Date(e.programadaPara) : new Date();
  try {
    const [c] = await query<{ id: number }>(sql`
      INSERT INTO bot_clima.campanas (nombre, descripcion, inbox_id, plantilla_nombre, plantilla_idioma, plantilla_categoria,
                                      plantilla_cuerpo, mapeo, programada_para, total, creada_por)
      VALUES (${e.nombre}, ${e.descripcion || null}, ${plantilla.inboxId}, ${plantilla.nombre}, ${plantilla.idioma},
              ${plantilla.categoria}, ${plantilla.cuerpo}, ${JSON.stringify(e.mapeo)}::jsonb,
              GREATEST(${cuando.toISOString()}::timestamptz, now()), ${filas.length}, ${sesion.adminId})
      RETURNING id`);
    for (let i = 0; i < filas.length; i += 2000) {
      await query(sql`
        INSERT INTO bot_clima.campana_destinatarios (campana_id, telefono, nombre, parametros)
        SELECT ${c!.id}, x.telefono, x.nombre, x.parametros
          FROM jsonb_to_recordset(${JSON.stringify(filas.slice(i, i + 2000))}::jsonb)
               AS x(telefono varchar, nombre varchar, parametros jsonb)
        ON CONFLICT (campana_id, telefono) DO NOTHING`);
    }
    await registrarLog('info', 'panel:difusiones', 'Difusión creada', {
      id: c!.id, nombre: e.nombre, plantilla: plantilla.nombre, contactos: filas.length, invalidos, repetidos, deBaja,
      programada_para: cuando.toISOString(), admin: sesion.usuario,
    });
    revalidatePath('/panel/campanas');
    const extra = [invalidos && `${invalidos} sin teléfono válido o con variables vacías`, repetidos && `${repetidos} repetidos`, deBaja && `${deBaja} que pidieron no recibir mensajes`].filter(Boolean);
    return {
      ok: true, id: c!.id,
      mensaje: `Difusión creada con ${filas.length.toLocaleString('es-BO')} contactos${extra.length ? ` (se omitieron ${extra.join(' y ')})` : ''}.`,
    };
  } catch (err) {
    return { ok: false, error: `No se pudo guardar: ${(err as Error).message}` };
  }
}

/** Pausar, reanudar, cancelar o enviar ya una difusión */
export async function accionCampana(id: number, accion: 'pausar' | 'reanudar' | 'cancelar' | 'enviar_ya'): Promise<Resultado> {
  const sesion = await requerirSesion();
  const reglas = {
    pausar:    { desde: ['enviando', 'programada'], a: 'pausada',   msg: 'Difusión pausada. Lo que falta no se enviará hasta reanudarla.' },
    reanudar:  { desde: ['pausada'],                a: 'enviando',  msg: 'Difusión reanudada.' },
    cancelar:  { desde: ['programada', 'enviando', 'pausada'], a: 'cancelada', msg: 'Difusión cancelada. Lo ya enviado no se puede deshacer.' },
    enviar_ya: { desde: ['programada'],             a: 'enviando',  msg: 'Se empieza a enviar en unos segundos.' },
  }[accion];
  if (!reglas) return { ok: false, error: 'Acción inválida.' };
  const [c] = await query<{ id: number }>(sql`
    UPDATE bot_clima.campanas
       SET estado = ${reglas.a},
           iniciada_el = CASE WHEN ${reglas.a} = 'enviando' THEN COALESCE(iniciada_el, now()) ELSE iniciada_el END,
           finalizada_el = CASE WHEN ${reglas.a} = 'cancelada' THEN now() ELSE finalizada_el END
     WHERE id = ${id} AND estado IN (SELECT jsonb_array_elements_text(${JSON.stringify(reglas.desde)}::jsonb))
    RETURNING id`);
  if (!c) return { ok: false, error: 'La difusión cambió de estado. Recarga la página.' };
  await registrarLog('info', 'panel:difusiones', `Difusión: ${accion}`, { id, admin: sesion.usuario });
  revalidatePath('/panel/campanas');
  revalidatePath(`/panel/campanas/${id}`);
  return { ok: true, mensaje: reglas.msg };
}

/** Vuelve a poner en cola los fallidos (por ejemplo, después de corregir un problema de Chatwoot) */
export async function reintentarFallidos(id: number): Promise<Resultado> {
  const sesion = await requerirSesion();
  const filas = await query<{ id: number }>(sql`
    UPDATE bot_clima.campana_destinatarios
       SET estado = 'pendiente', intentos = 0, error = NULL, chatwoot_message_id = NULL, enviado_el = NULL,
           entregado_el = NULL, leido_el = NULL, revisado_el = NULL, actualizado_el = now()
     WHERE campana_id = ${id} AND estado = 'fallido'
    RETURNING id`);
  if (!filas.length) return { ok: false, error: 'No hay mensajes fallidos.' };
  await query(sql`
    UPDATE bot_clima.campanas SET estado = 'enviando', finalizada_el = NULL, iniciada_el = COALESCE(iniciada_el, now())
     WHERE id = ${id} AND estado IN ('enviada', 'enviando')`);
  await registrarLog('info', 'panel:difusiones', 'Reintento de fallidos', { id, cantidad: filas.length, admin: sesion.usuario });
  revalidatePath(`/panel/campanas/${id}`);
  return { ok: true, mensaje: `${filas.length} mensaje(s) vuelven a la cola.` };
}

export async function eliminarCampana(id: number): Promise<Resultado> {
  const sesion = await requerirSesion();
  const [c] = await query<{ nombre: string }>(sql`
    DELETE FROM bot_clima.campanas WHERE id = ${id} AND estado <> 'enviando' RETURNING nombre`);
  if (!c) return { ok: false, error: 'No se puede eliminar mientras se está enviando (páusala primero).' };
  await registrarLog('aviso', 'panel:difusiones', 'Difusión eliminada', { id, nombre: c.nombre, admin: sesion.usuario });
  revalidatePath('/panel/campanas');
  return { ok: true, mensaje: 'Difusión eliminada.' };
}
