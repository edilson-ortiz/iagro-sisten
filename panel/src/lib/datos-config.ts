import 'server-only';
import { query, sql } from '@/lib/db';

export type TipoConfig = 'numero' | 'texto' | 'texto_largo' | 'booleano' | 'hora' | 'opcion' | 'secreto';

export type ConfigFila = {
  clave: string;
  valor: unknown;
  tipo: TipoConfig;
  grupo: string;
  etiqueta: string;
  descripcion: string | null;
  orden: number;
  opciones: { valor: string; etiqueta: string }[] | null;
  updated_at: string;
  actualizado_por: string | null;
};

export async function listarConfig() {
  const filas = await query<ConfigFila>(sql`
    SELECT c.clave, c.valor, c.tipo, c.grupo, c.etiqueta, c.descripcion, c.orden, c.opciones, c.updated_at,
           a.nombre AS actualizado_por
    FROM bot_clima.configuracion c
    LEFT JOIN bot_clima.administradores a ON a.id = c.updated_by
    ORDER BY c.orden, c.clave`);
  // Los secretos nunca viajan al navegador
  return filas.map((f) => (f.tipo === 'secreto' ? { ...f, valor: '' } : f));
}

export async function leerConfig<T = unknown>(clave: string): Promise<T | null> {
  const [r] = await query<{ valor: T }>(sql`SELECT valor FROM bot_clima.configuracion WHERE clave = ${clave}`);
  return r ? r.valor : null;
}

export type PlanFila = {
  id: number; nombre: string; descripcion: string | null; dias: number; monto: number; moneda: string;
  activo: boolean; orden: number; pagos: number; tokens_mes: number | null;
};

export async function listarPlanes() {
  return query<PlanFila>(sql`
    SELECT p.id, p.nombre, p.descripcion, p.dias, p.monto, p.moneda, p.activo, p.orden, p.tokens_mes,
           (SELECT count(*) FROM bot_clima.pagos x WHERE x.plan_id = p.id) AS pagos
    FROM bot_clima.planes p ORDER BY p.activo DESC, p.orden, p.id`);
}

/** Resumen de la regla de alertas (para mostrarlo en Alertas e Inicio) */
export async function reglaAlertas() {
  const [r] = await query<{
    activa: boolean; umbral: number; horas: number; max_semana: number; horas_entre: number;
    desde: string; hasta: string; fuente: string; mm_minimo: number; pausar_sin_leer: number;
  }>(sql`
    SELECT bot_clima.cfg_texto('lluvia_activa', 'true') = 'true'      AS activa,
           bot_clima.cfg_num('lluvia_umbral', 60)                      AS umbral,
           bot_clima.cfg_num('lluvia_horas_anticipacion', 24)          AS horas,
           bot_clima.cfg_num('lluvia_max_por_semana', 1)               AS max_semana,
           bot_clima.cfg_num('lluvia_horas_entre_alertas', 48)         AS horas_entre,
           bot_clima.cfg_texto('lluvia_hora_desde', '06:00')           AS desde,
           bot_clima.cfg_texto('lluvia_hora_hasta', '20:00')           AS hasta,
           bot_clima.cfg_texto('lluvia_fuente', 'iagro')               AS fuente,
           bot_clima.cfg_num('lluvia_mm_minimo', 0)                    AS mm_minimo,
           bot_clima.cfg_num('lluvia_pausar_sin_leer', 2)              AS pausar_sin_leer`);
  return r!;
}
