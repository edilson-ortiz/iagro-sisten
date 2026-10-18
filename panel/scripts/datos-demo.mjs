#!/usr/bin/env node
// Carga datos de EJEMPLO (pagos, alertas, difusión) para ver el panel con contenido.
// Solo funciona contra una base local (localhost). Nunca lo ejecutes en producción.
import pg from 'pg';

const url = process.env.DATABASE_URL ?? '';
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  console.error('✖ Este script solo se ejecuta contra una base LOCAL (localhost). DATABASE_URL apunta a otro servidor.');
  process.exit(1);
}

const c = new pg.Client({ connectionString: url });
await c.connect();
const q = (s, p) => c.query(s, p);

/** Próxima lluvia de ejemplo por usuario + 2 usuarios en pausa por no leer (se carga una sola vez) */
async function demoPronosticos() {
  const { rows: hay } = await q('SELECT count(*)::int n FROM bot_clima.pronosticos');
  if (hay[0].n > 0) return false;
  await q('BEGIN');
  const { rows: vs } = await q('SELECT id FROM bot_clima.v_usuarios WHERE vigente AND latitud IS NOT NULL ORDER BY id');
  const horas = [3, 8, 14, 20, 23, 30, 41, 55, null, 70, null, 18];
  for (const [i, { id }] of vs.entries()) {
    const h = horas[i % horas.length];
    const err = i === vs.length - 1 ? 'ECONNREFUSED (demo)' : null;
    await q(`INSERT INTO bot_clima.pronosticos (usuario_id, proxima_lluvia, probabilidad, mm, horizonte_hasta, fuente, error, consultado_el)
             VALUES ($1, CASE WHEN $2::int IS NULL OR $5::text IS NOT NULL THEN NULL ELSE date_trunc('hour', now()) + make_interval(hours => $2::int) END,
                     CASE WHEN $2::int IS NULL OR $5::text IS NOT NULL THEN NULL ELSE $3::int END, $4, date_trunc('day', now()) + interval '3 days', 'iagro', $5,
                     now() - interval '17 minutes')`,
      [id, h, 62 + ((i * 11) % 36), h == null ? null : ((i * 7) % 12) / 2, err]);
  }
  // Dos usuarios no leyeron sus 2 últimas alertas → quedan en pausa
  for (const id of vs.slice(2, 4).map((r) => r.id)) {
    for (const dias of [9, 2]) {
      await q(`INSERT INTO bot_clima.alertas_enviadas (usuario_id, tipo, probabilidad, hora_pronostico, estado, enviada_el, entregado_el)
               VALUES ($1, 'lluvia', 80, now() - make_interval(days => $2::int) + interval '24 hours', 'entregado',
                       now() - make_interval(days => $2::int), now() - make_interval(days => $2::int))`, [id, dias]);
    }
    await q("UPDATE bot_clima.usuarios SET ultimo_mensaje_el = now() - interval '20 days' WHERE id = $1", [id]);
  }
  // Uno con lluvia en 8 h ya fue avisado hace 16 h y leyó la alerta
  const avisado = vs[1]?.id;
  if (avisado) {
    await q(`INSERT INTO bot_clima.alertas_enviadas (usuario_id, tipo, probabilidad, hora_pronostico, estado, enviada_el, entregado_el, leido_el, chatwoot_conversation_id, chatwoot_message_id)
             SELECT usuario_id, 'lluvia', probabilidad, proxima_lluvia, 'leido', now() - interval '16 hours', now() - interval '16 hours', now() - interval '15 hours', 100 + usuario_id, 9500 + usuario_id
               FROM bot_clima.pronosticos WHERE usuario_id = $1`, [avisado]);
    await q("UPDATE bot_clima.usuarios SET ultima_alerta_lluvia = now() - interval '16 hours' WHERE id = $1", [avisado]);
  }
  await q('COMMIT');
  return true;
}

try {
  if (await demoPronosticos()) console.log('✔ Pronósticos de ejemplo cargados (próxima lluvia por usuario y 2 en pausa).');
  const { rows: ya } = await q("SELECT count(*)::int n FROM bot_clima.logs WHERE origen = 'demo'");
  if (ya[0].n > 0) {
    console.log('ℹ Los datos de ejemplo ya estaban cargados.');
    process.exit(0);
  }
  await q('BEGIN');
  const { rows: us } = await q('SELECT id FROM bot_clima.usuarios WHERE activo ORDER BY id');
  const ids = us.map((r) => Number(r.id));
  const pick = (n, salto) => ids.filter((_, i) => i % salto === 0).slice(0, n);

  // Zonas de ejemplo (para filtros y difusiones por zona)
  const zonas = ['Santa Cruz', 'San Julián', 'Montero', 'Yapacaní', 'Cuatro Cañadas', 'La Paz'];
  for (const [i, id] of ids.entries()) {
    await q('UPDATE bot_clima.usuarios SET zona = COALESCE(zona, $2) WHERE id = $1', [id, zonas[i % zonas.length]]);
  }

  // Pagos: varios usuarios pagaron en meses anteriores
  const { rows: plan } = await q('UPDATE bot_clima.planes SET monto = 35 WHERE monto = 0 RETURNING id');
  for (const [i, id] of pick(9, 3).entries()) {
    await q('SELECT bot_clima.registrar_pago($1, $2, 35, NULL, NULL, $3)', [id, plan[0]?.id ?? null, 'Pago QR (demo)']);
    await q("UPDATE bot_clima.pagos SET fecha = now() - make_interval(days => $2) WHERE usuario_id = $1", [id, i * 9]);
  }

  // Vencidos y por vencer
  for (const id of pick(3, 7)) await q("UPDATE bot_clima.usuarios SET vence_el = bot_clima.hoy() - 4 WHERE id = $1 AND estado = 'prueba'", [id]);
  await q('SELECT * FROM bot_clima.marcar_vencidos()');
  for (const id of pick(3, 5)) await q("UPDATE bot_clima.usuarios SET vence_el = bot_clima.hoy() + 3 WHERE id = $1 AND estado = 'prueba'", [id]);

  // Alertas de lluvia con distintos estados
  const estados = ['leido', 'leido', 'entregado', 'enviado', 'fallido', 'leido', 'entregado'];
  for (const [i, id] of pick(12, 2).entries()) {
    const est = estados[i % estados.length];
    const { rows: a } = await q(
      `SELECT * FROM bot_clima.registrar_alerta_lluvia($1::bigint, $2::int, now() + interval '24 hours', 100 + $1::bigint, 9000 + $1::bigint, $3::text)`,
      [id, 60 + ((i * 7) % 35), est === 'fallido' ? 'Plantilla no aprobada (demo)' : null]);
    await q(`UPDATE bot_clima.alertas_enviadas SET enviada_el = now() - make_interval(hours => $2::int), estado = $3::text,
               entregado_el = CASE WHEN $3::text IN ('entregado','leido') THEN now() - make_interval(hours => $2::int - 1) END,
               leido_el = CASE WHEN $3::text = 'leido' THEN now() - make_interval(hours => $2::int - 2) END,
               respondio_el = CASE WHEN $4::boolean AND $3::text <> 'fallido' THEN now() - make_interval(hours => $2::int - 3) END
             WHERE id = $1::bigint`, [a[0].id, 3 + i * 9, est, i % 4 === 0]);
    if (est !== 'fallido') {
      await q('UPDATE bot_clima.usuarios SET ultima_alerta_lluvia = now() - make_interval(hours => $2::int) WHERE id = $1::bigint', [id, 3 + i * 9]);
    }
  }

  // Una difusión enviada
  const { rows: d } = await q(`INSERT INTO bot_clima.difusiones (titulo, mensaje, segmento, estado, enviada_el, total_destinatarios)
    VALUES ('Inicio de temporada de lluvias', '🌧️ Comienza la temporada de lluvias. Revisa tus drenajes.', 'todos', 'enviada', now() - interval '2 days', 0) RETURNING id`);
  for (const [i, id] of ids.slice(0, 15).entries()) {
    await q(`INSERT INTO bot_clima.difusion_envios (difusion_id, usuario_id, enviado, enviado_el, entregado, leido, respondio, respondio_el)
             VALUES ($1, $2, true, now() - interval '2 days', $3, $4, $5, CASE WHEN $5 THEN now() - interval '1 day' END)`,
      [d[0].id, id, i % 6 !== 0, i % 3 !== 0, i % 4 === 0]);
  }
  await q('UPDATE bot_clima.difusiones SET total_destinatarios = 15 WHERE id = $1', [d[0].id]);

  await q("SELECT bot_clima.log('info', 'demo', 'Datos de ejemplo cargados')");
  await q('COMMIT');
  console.log('✔ Datos de ejemplo cargados (zonas, pagos, alertas y una difusión).');
} catch (err) {
  await q('ROLLBACK');
  console.error('✖', err.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
