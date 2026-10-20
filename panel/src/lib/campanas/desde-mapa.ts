/**
 * El Mapa de clientes pasa los seleccionados al formulario de difusiones por sessionStorage
 * (pueden ser miles: no caben en la URL). El formulario los carga como si fueran un archivo.
 */
export const CLAVE_DESDE_MAPA = 'iagro:contactos-mapa';

export type ArchivoContactos = { nombre: string; columnas: string[]; filas: Record<string, string>[] };
