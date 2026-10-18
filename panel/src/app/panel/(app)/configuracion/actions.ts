'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requerirSesion } from '@/lib/auth';
import { query, registrarLog, sql } from '@/lib/db';
import type { Resultado } from '@/app/panel/(app)/usuarios/actions';

// Límites razonables por clave (lo que no está aquí solo valida el tipo)
const LIMITES: Record<string, [number, number]> = {
  prueba_dias: [0, 365],
  pago_dias: [1, 3650],
  tokens_mes: [0, 100000],
  lluvia_fuerte_mm: [1, 500],
  referidos_meta: [1, 100],
  referidos_premio_dias: [1, 365],
  lluvia_umbral: [1, 99],
  lluvia_horas_anticipacion: [1, 72],
  lluvia_max_por_semana: [1, 14],
  lluvia_horas_entre_alertas: [0, 168],
  lluvia_mm_minimo: [0, 200],
  lluvia_agrupar_km: [1, 100],
  lluvia_pausar_sin_leer: [0, 20],
  lluvia_horas_para_leer: [1, 168],
  aviso_vencimiento_dias: [1, 30],
  respuesta_ventana_dias: [1, 14],
  difusion_pausa_ms: [0, 60000],
  difusion_pausar_sin_respuesta: [0, 20],
  chatwoot_account_id: [1, 1e9],
  chatwoot_inbox_id: [0, 1e9],
};

/** Guarda varias claves de configuración a la vez (un grupo del formulario) */
export async function guardarConfig(cambios: Record<string, string | boolean>): Promise<Resultado> {
  const sesion = await requerirSesion();
  const claves = Object.keys(cambios);
  if (!claves.length) return { ok: true, mensaje: 'Sin cambios.' };

  let filas: { clave: string; tipo: string; etiqueta: string; opciones: { valor: string }[] | null }[];
  try {
    filas = await query(sql`
      SELECT clave, tipo, etiqueta, opciones FROM bot_clima.configuracion
      WHERE clave IN (SELECT jsonb_array_elements_text(${JSON.stringify(claves)}::jsonb))`);
  } catch (err) {
    return { ok: false, error: `No se pudo leer la configuración: ${(err as Error).message}` };
  }
  const porClave = new Map(filas.map((f) => [f.clave, f]));

  const valores: [string, unknown][] = [];
  for (const [clave, crudo] of Object.entries(cambios)) {
    const f = porClave.get(clave);
    if (!f || f.tipo === 'secreto') return { ok: false, error: `No se puede editar "${clave}".` };
    let valor: unknown;
    switch (f.tipo) {
      case 'numero': {
        const n = Number(String(crudo).replace(',', '.'));
        const [min, max] = LIMITES[clave] ?? [0, 1e9];
        if (!Number.isFinite(n) || n < min || n > max) return { ok: false, error: `"${f.etiqueta}" debe estar entre ${min} y ${max}.` };
        valor = n;
        break;
      }
      case 'booleano':
        valor = crudo === true || crudo === 'true';
        break;
      case 'hora':
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(crudo))) return { ok: false, error: `"${f.etiqueta}" debe tener formato HH:MM.` };
        valor = String(crudo);
        break;
      case 'opcion':
        if (!f.opciones?.some((o) => o.valor === crudo)) return { ok: false, error: `Opción inválida en "${f.etiqueta}".` };
        valor = String(crudo);
        break;
      default: {
        const t = String(crudo);
        if (t.length > 4000) return { ok: false, error: `"${f.etiqueta}" es demasiado largo.` };
        if (clave === 'n8n_webhook_difusion' && t && !/^https?:\/\/\S+$/.test(t)) return { ok: false, error: 'La URL del webhook debe empezar con http:// o https://' };
        if (clave === 'whatsapp_numero' && !/^\d{10,15}$/.test(t.trim())) return { ok: false, error: 'El número de WhatsApp va con código de país y sin +, ej. 59176762207.' };
        valor = t.trim();
      }
    }
    valores.push([clave, valor]);
  }

  // Coherencia del horario de envío
  const desde = (valores.find(([c]) => c === 'lluvia_hora_desde')?.[1] as string) ?? null;
  const hasta = (valores.find(([c]) => c === 'lluvia_hora_hasta')?.[1] as string) ?? null;
  if (desde && hasta && desde >= hasta) return { ok: false, error: 'La hora "desde" debe ser anterior a la hora "hasta".' };

  try {
    for (const [clave, valor] of valores) {
      await query(sql`UPDATE bot_clima.configuracion SET valor = ${JSON.stringify(valor)}::jsonb, updated_by = ${sesion.adminId}
                      WHERE clave = ${clave}`);
    }
    await registrarLog('info', 'panel:configuracion', 'Configuración actualizada', { admin: sesion.usuario, cambios: Object.fromEntries(valores) });
    revalidatePath('/panel', 'layout');
    return { ok: true, mensaje: 'Cambios guardados. Los flujos de n8n los usan desde la próxima ejecución.' };
  } catch (err) {
    return { ok: false, error: `No se pudo guardar: ${(err as Error).message}` };
  }
}

const esquemaPlan = z.object({
  id: z.number().int().positive().optional(),
  nombre: z.string().trim().min(2, 'El nombre es muy corto').max(80),
  descripcion: z.string().trim().max(300),
  dias: z.coerce.number().int().min(1, 'Mínimo 1 día').max(3650),
  monto: z.coerce.number().min(0).max(100000),
  moneda: z.string().trim().toUpperCase().length(3, 'La moneda es un código de 3 letras (BOB, USD)'),
  activo: z.boolean(),
  orden: z.coerce.number().int().min(0).max(1000),
  tokens_mes: z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().int().min(0, 'Tokens: mínimo 0').max(100000).nullable()),
});

export async function guardarPlan(entrada: z.input<typeof esquemaPlan>): Promise<Resultado> {
  const sesion = await requerirSesion();
  const d = esquemaPlan.safeParse(entrada);
  if (!d.success) return { ok: false, error: d.error.issues[0]?.message ?? 'Datos inválidos' };
  const p = d.data;
  try {
    if (p.id) {
      await query(sql`UPDATE bot_clima.planes SET nombre = ${p.nombre}, descripcion = ${p.descripcion || null}, dias = ${p.dias},
                      monto = ${p.monto}, moneda = ${p.moneda}, activo = ${p.activo}, orden = ${p.orden},
                      tokens_mes = ${p.tokens_mes} WHERE id = ${p.id}`);
    } else {
      await query(sql`INSERT INTO bot_clima.planes (nombre, descripcion, dias, monto, moneda, activo, orden, tokens_mes)
                      VALUES (${p.nombre}, ${p.descripcion || null}, ${p.dias}, ${p.monto}, ${p.moneda}, ${p.activo}, ${p.orden}, ${p.tokens_mes})`);
    }
    await registrarLog('info', 'panel:planes', p.id ? 'Plan editado' : 'Plan creado', { ...p, admin: sesion.usuario });
    revalidatePath('/panel/configuracion');
    revalidatePath('/panel/usuarios');
    return { ok: true, mensaje: p.id ? 'Plan actualizado.' : 'Plan creado.' };
  } catch (err) {
    return { ok: false, error: `No se pudo guardar el plan: ${(err as Error).message}` };
  }
}
