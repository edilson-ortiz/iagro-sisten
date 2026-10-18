import type { ProximaFila } from '@/lib/datos-alertas';
import { ZONA_HORARIA } from '@/lib/utils';

export type Regla = { activa: boolean; horas: number; desde: string; hasta: string };

export type Situacion = {
  clave: 'desactivado' | 'sin_ubicacion' | 'enviada' | 'por_enviar' | 'programada' | 'en_espera' | 'sin_lluvia' | 'sin_pronostico' | 'apagadas';
  texto: string;
  detalle?: string;
};

const H = 3600e3;

/** Por qué un usuario no recibe alertas */
export function motivoDesactivadas(por: string | null): string {
  if (por === 'usuario') return 'Tocó "Dejar de recibir". Vuelve si escribe "Activar alertas" o lo reactivas.';
  if (por === 'sin_respuesta') return 'Se desactivaron solas: no respondió varias alertas seguidas. Solo vuelven si lo reactivas.';
  return 'Desactivadas desde el panel.';
}

/** "Faltan 5 h", "Falta 1 día 3 h", "Lloviendo ahora" */
export function textoFalta(iso: string | null, ahora = Date.now()): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - ahora;
  if (ms <= 0) return 'Ahora';
  const h = Math.round(ms / H);
  if (h < 1) return 'Menos de 1 h';
  if (h < 48) return `${h} h`;
  const d = Math.floor(h / 24);
  const r = h % 24;
  return `${d} días${r ? ` ${r} h` : ''}`;
}

/** Hora y minutos actuales en la zona del sistema ("14:05") */
function horaLocal(ahora: number) {
  return new Date(ahora).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: ZONA_HORARIA });
}

function cuando(iso: string | number) {
  return new Date(iso).toLocaleString('es-BO', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: ZONA_HORARIA });
}

/** La última alerta corresponde a la lluvia actual: se envió hace menos de 48 h y esa lluvia todavía no pasó */
export function alertaVigente(f: ProximaFila, ahora = Date.now()) {
  return !!f.alerta_id && !!f.alerta_hora_pronostico && !!f.alerta_enviada_el
    && new Date(f.alerta_hora_pronostico).getTime() > ahora - 6 * H
    && new Date(f.alerta_enviada_el).getTime() > ahora - 48 * H;
}

/** Qué pasa con la alerta de este usuario, en palabras */
export function situacionAlerta(f: ProximaFila, regla: Regla, ahora = Date.now()): Situacion {
  if (!f.tiene_ubicacion) return { clave: 'sin_ubicacion', texto: 'Sin ubicación', detalle: 'No se puede consultar su pronóstico.' };
  if (!f.alertas_activas) return { clave: 'desactivado', texto: 'Alertas desactivadas', detalle: motivoDesactivadas(f.alertas_desactivadas_por) };
  if (alertaVigente(f, ahora)) {
    return f.alerta_estado === 'fallido'
      ? { clave: 'enviada', texto: 'El envío falló', detalle: f.alerta_error ?? undefined }
      : { clave: 'enviada', texto: 'Alerta enviada', detalle: cuando(f.alerta_enviada_el!) };
  }
  if (!f.consultado_el) return { clave: 'sin_pronostico', texto: 'Aún sin pronóstico', detalle: 'Se consulta cada hora.' };
  if (!f.proxima_lluvia) {
    return f.pronostico_error
      ? { clave: 'sin_pronostico', texto: 'Error del pronóstico', detalle: f.pronostico_error }
      : { clave: 'sin_lluvia', texto: 'Sin lluvia prevista', detalle: f.horizonte_hasta ? `hasta ${cuando(f.horizonte_hasta)}` : undefined };
  }
  if (!regla.activa) return { clave: 'apagadas', texto: 'Alertas apagadas', detalle: 'Actívalas en Configuración.' };

  const lluvia = new Date(f.proxima_lluvia).getTime();
  const libre = f.alerta_bloqueada_hasta ? new Date(f.alerta_bloqueada_hasta).getTime() : 0;
  const entraEnVentana = lluvia - regla.horas * H;

  if (lluvia <= ahora) return { clave: 'sin_lluvia', texto: 'Lloviendo ahora', detalle: 'No se alcanzó a avisar antes.' };
  if (libre > ahora && libre >= lluvia) {
    return { clave: 'en_espera', texto: 'No se avisará', detalle: `Ya recibió su máximo de alertas. Libre desde el ${cuando(libre)}` };
  }
  if (ahora >= entraEnVentana) {
    if (libre > ahora) return { clave: 'en_espera', texto: 'En espera', detalle: `Se avisa cuando se libere: ${cuando(libre)}` };
    const hora = horaLocal(ahora);
    const enHorario = hora >= regla.desde && hora <= regla.hasta;
    return { clave: 'por_enviar', texto: 'Se envía en la próxima revisión', detalle: enHorario ? 'En menos de 1 hora.' : `Fuera de horario: desde las ${regla.desde}.` };
  }
  return { clave: 'programada', texto: 'Programada', detalle: `Se avisará aprox. el ${cuando(Math.max(entraEnVentana, libre))}` };
}
