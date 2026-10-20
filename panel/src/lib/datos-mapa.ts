import 'server-only';
import { query, sql } from '@/lib/db';
import type { EstadoUsuario } from '@/lib/db/schema';

export type PuntoMapa = {
  id: number;
  nombre: string | null;
  telefono: string;
  zona: string | null;
  estado: EstadoUsuario;
  activo: boolean;
  alertas_activas: boolean;
  vence_el: string;
  dias_restantes: number;
  fecha_registro: string;
  latitud: number;
  longitud: number;
};

/** Todos los clientes con ubicación (mapa) y cuántos no tienen */
export async function puntosMapa() {
  const [puntos, [sin]] = await Promise.all([
    query<PuntoMapa>(sql`
      SELECT id, nombre, telefono, zona, estado, activo, alertas_activas, vence_el::text AS vence_el, dias_restantes,
             fecha_registro::date::text AS fecha_registro, latitud, longitud
        FROM bot_clima.v_usuarios
       WHERE latitud IS NOT NULL AND longitud IS NOT NULL AND NOT (latitud = 0 AND longitud = 0)
       ORDER BY lower(nombre) NULLS LAST, id`),
    query<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM bot_clima.usuarios
       WHERE latitud IS NULL OR longitud IS NULL OR (latitud = 0 AND longitud = 0)`),
  ]);
  return { puntos, sinUbicacion: sin?.n ?? 0 };
}
