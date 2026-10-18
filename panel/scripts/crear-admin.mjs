#!/usr/bin/env node
// Crea (o actualiza la contraseña de) un administrador del panel.
// Uso:  DATABASE_URL=postgres://... node scripts/crear-admin.mjs <usuario> "<Nombre completo>"
// La contraseña se pide por consola (no queda en el historial de comandos).
import readline from 'node:readline';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const [usuario, nombre] = process.argv.slice(2);
if (!usuario || !nombre) {
  console.error('Uso: node scripts/crear-admin.mjs <usuario> "<Nombre completo>"');
  process.exit(1);
}
if (!/^[a-zA-Z0-9._-]{3,50}$/.test(usuario)) {
  console.error('✖ El usuario debe tener 3–50 caracteres: letras, números, punto, guion o guion bajo.');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('✖ Falta la variable DATABASE_URL');
  process.exit(1);
}

function preguntarOculto(texto) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => rl.output.write(s.startsWith(texto) ? s : '*');
    rl.question(texto, (r) => { rl.close(); process.stdout.write('\n'); resolve(r); });
  });
}

const pass = process.env.ADMIN_PASSWORD || (await preguntarOculto('Contraseña (mínimo 10 caracteres): '));
if (pass.length < 10) {
  console.error('✖ La contraseña debe tener al menos 10 caracteres.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const hash = await bcrypt.hash(pass, 12);
  const { rows } = await client.query(
    `INSERT INTO bot_clima.administradores (usuario, nombre, password_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT (usuario) DO UPDATE SET nombre = EXCLUDED.nombre, password_hash = EXCLUDED.password_hash, activo = true
     RETURNING id, (xmax = 0) AS nuevo`,
    [usuario.toLowerCase(), nombre, hash]
  );
  console.log(rows[0].nuevo ? `✔ Administrador "${usuario}" creado.` : `✔ Contraseña de "${usuario}" actualizada.`);
} catch (err) {
  console.error(`✖ ${err.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
