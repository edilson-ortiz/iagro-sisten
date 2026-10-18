#!/usr/bin/env node
// Aplica en orden las migraciones de db/migrations que aún no se ejecutaron.
// Uso:  DATABASE_URL=postgres://... node scripts/migrar.mjs [--estado]
// Cada archivo corre en su propia transacción; si falla, no queda a medias.
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');
const soloEstado = process.argv.includes('--estado');

if (!process.env.DATABASE_URL) {
  console.error('✖ Falta la variable DATABASE_URL (ver .env.example)');
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  await client.query('CREATE SCHEMA IF NOT EXISTS bot_clima');
  await client.query(`
    CREATE TABLE IF NOT EXISTS bot_clima.schema_migrations (
      version     varchar(200) PRIMARY KEY,
      checksum    char(64)     NOT NULL,
      aplicada_el timestamptz  NOT NULL DEFAULT now()
    )`);

  const { rows } = await client.query('SELECT version, checksum FROM bot_clima.schema_migrations');
  const aplicadas = new Map(rows.map((r) => [r.version, r.checksum]));
  const archivos = (await readdir(DIR)).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();

  let pendientes = 0;
  for (const archivo of archivos) {
    const sql = await readFile(path.join(DIR, archivo), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');

    if (aplicadas.has(archivo)) {
      if (aplicadas.get(archivo) !== checksum) {
        console.warn(`⚠ ${archivo} cambió después de aplicarse. No se vuelve a ejecutar: crea una migración nueva.`);
      } else if (soloEstado) {
        console.log(`✔ ${archivo}`);
      }
      continue;
    }

    pendientes++;
    if (soloEstado) {
      console.log(`… ${archivo} (pendiente)`);
      continue;
    }

    process.stdout.write(`→ Aplicando ${archivo} ... `);
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO bot_clima.schema_migrations (version, checksum) VALUES ($1, $2)', [archivo, checksum]);
      await client.query('COMMIT');
      console.log('listo');
    } catch (err) {
      await client.query('ROLLBACK');
      console.log('ERROR');
      console.error(`✖ ${archivo}: ${err.message}`);
      if (err.position) console.error(`  (posición ${err.position} del archivo)`);
      process.exit(1);
    }
  }

  console.log(pendientes === 0 ? '✔ Base de datos al día.' : soloEstado ? `${pendientes} migración(es) pendiente(s).` : '✔ Migraciones aplicadas.');
} catch (err) {
  console.error(`✖ No se pudo conectar o migrar: ${err.message}`);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
