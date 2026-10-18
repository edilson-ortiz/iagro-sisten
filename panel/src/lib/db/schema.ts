// Esquema Drizzle de bot_clima (refleja db/migrations; las migraciones SQL son la fuente de verdad).
import {
  bigint, bigserial, boolean, date, doublePrecision, integer, jsonb, numeric, pgSchema, smallint, text,
  timestamp, varchar,
} from 'drizzle-orm/pg-core';

export const botClima = pgSchema('bot_clima');

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'string' });
const id = (name: string) => bigint(name, { mode: 'number' });

export const administradores = botClima.table('administradores', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  usuario: varchar('usuario', { length: 50 }).notNull(),
  nombre: varchar('nombre', { length: 120 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  activo: boolean('activo').notNull(),
  ultimoAcceso: ts('ultimo_acceso'),
  createdAt: ts('created_at').notNull(),
  updatedAt: ts('updated_at').notNull(),
});

export const configuracion = botClima.table('configuracion', {
  clave: varchar('clave', { length: 80 }).primaryKey(),
  valor: jsonb('valor').notNull(),
  tipo: varchar('tipo', { length: 20 }).notNull(),
  grupo: varchar('grupo', { length: 40 }).notNull(),
  etiqueta: varchar('etiqueta', { length: 120 }).notNull(),
  descripcion: text('descripcion'),
  orden: integer('orden').notNull(),
  updatedAt: ts('updated_at').notNull(),
  updatedBy: id('updated_by'),
});

export const planes = botClima.table('planes', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  nombre: varchar('nombre', { length: 80 }).notNull(),
  descripcion: text('descripcion'),
  dias: integer('dias').notNull(),
  monto: numeric('monto', { precision: 10, scale: 2 }).notNull(),
  moneda: varchar('moneda', { length: 3 }).notNull(),
  activo: boolean('activo').notNull(),
  orden: integer('orden').notNull(),
});

export const usuarios = botClima.table('usuarios', {
  id: id('id').primaryKey(),
  chatwootContactId: id('chatwoot_contact_id'),
  telefono: varchar('telefono', { length: 20 }).notNull(),
  nombre: varchar('nombre', { length: 150 }),
  latitud: doublePrecision('latitud'),
  longitud: doublePrecision('longitud'),
  zona: varchar('zona', { length: 120 }),
  ubicacionOrigen: varchar('ubicacion_origen', { length: 12 }),
  fechaRegistro: ts('fecha_registro').notNull(),
  estado: varchar('estado', { length: 10 }).$type<EstadoUsuario>().notNull(),
  venceEl: date('vence_el', { mode: 'string' }).notNull(),
  ultimaAlertaLluvia: ts('ultima_alerta_lluvia'),
  avisoVencimientoEl: date('aviso_vencimiento_el', { mode: 'string' }),
  activo: boolean('activo').notNull(),
  notas: text('notas'),
});

export const pagos = botClima.table('pagos', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  usuarioId: id('usuario_id').notNull(),
  planId: id('plan_id'),
  fecha: ts('fecha').notNull(),
  monto: numeric('monto', { precision: 10, scale: 2 }).notNull(),
  moneda: varchar('moneda', { length: 3 }).notNull(),
  diasAgregados: integer('dias_agregados').notNull(),
  venceAnterior: date('vence_anterior', { mode: 'string' }),
  venceNuevo: date('vence_nuevo', { mode: 'string' }).notNull(),
  registradoPor: id('registrado_por'),
  nota: text('nota'),
});

export const alertasEnviadas = botClima.table('alertas_enviadas', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  usuarioId: id('usuario_id').notNull(),
  tipo: varchar('tipo', { length: 30 }).notNull(),
  probabilidad: smallint('probabilidad'),
  horaPronostico: ts('hora_pronostico'),
  enviadaEl: ts('enviada_el').notNull(),
  estado: varchar('estado', { length: 10 }).$type<EstadoMensaje>().notNull(),
  entregadoEl: ts('entregado_el'),
  leidoEl: ts('leido_el'),
  respondioEl: ts('respondio_el'),
  error: text('error'),
});

export const logs = botClima.table('logs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  nivel: varchar('nivel', { length: 6 }).notNull(),
  origen: varchar('origen', { length: 60 }).notNull(),
  mensaje: text('mensaje').notNull(),
  datos: jsonb('datos'),
  createdAt: ts('created_at').notNull(),
});

export type EstadoUsuario = 'prueba' | 'pagado' | 'vencido';
export type EstadoMensaje = 'enviado' | 'entregado' | 'leido' | 'fallido';
export type Plan = typeof planes.$inferSelect;
