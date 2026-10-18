import 'server-only';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql, type SQL } from 'drizzle-orm';
import { Pool, types } from 'pg';
import * as schema from './schema';

// Tipos: fechas como texto (sin corrimientos de zona horaria), bigint como número (ids y conteos pequeños)
types.setTypeParser(1082, (v) => v); // date
types.setTypeParser(1114, (v) => v); // timestamp
types.setTypeParser(1184, (v) => new Date(v).toISOString()); // timestamptz
types.setTypeParser(20, (v) => Number(v)); // int8
types.setTypeParser(1700, (v) => Number(v)); // numeric

// Un solo pool por proceso (en desarrollo Next recarga módulos: se guarda en globalThis)
const g = globalThis as unknown as { __iagroPool?: Pool };

function crearPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('Falta DATABASE_URL. Copia .env.example como .env y complétalo.');
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 30_000 });
  pool.on('error', (err) => console.error('[db] error en conexión inactiva:', err.message));
  return pool;
}

export const pool = g.__iagroPool ?? (g.__iagroPool = crearPool());
export const db = drizzle(pool, { schema });

/** Ejecuta SQL crudo (vistas y funciones de bot_clima) y devuelve las filas tipadas. */
export async function query<T>(q: SQL): Promise<T[]> {
  const res = await db.execute(q);
  return res.rows as T[];
}

export async function registrarLog(nivel: 'info' | 'aviso' | 'error', origen: string, mensaje: string, datos?: unknown) {
  try {
    await db.execute(sql`SELECT bot_clima.log(${nivel}, ${origen}, ${mensaje}, ${datos ? JSON.stringify(datos) : null}::jsonb)`);
  } catch (err) {
    console.error('[log] no se pudo registrar:', (err as Error).message);
  }
}

export { sql };
