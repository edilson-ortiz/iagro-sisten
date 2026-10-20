import type { Metadata } from 'next';
import { requerirSesion } from '@/lib/auth';
import { puntosMapa } from '@/lib/datos-mapa';
import { Encabezado } from '@/components/shell';
import { MapaClientes } from '@/components/mapa/mapa-clientes';

export const metadata: Metadata = { title: 'Mapa de clientes' };

export default async function MapaPage() {
  await requerirSesion();
  const { puntos, sinUbicacion } = await puntosMapa();
  return (
    <>
      <Encabezado
        titulo="Mapa de clientes"
        descripcion="Todos los campos en el mapa. Selecciona por zona para hacer una difusión o descargar los datos."
      />
      <MapaClientes puntos={puntos} sinUbicacion={sinUbicacion} />
    </>
  );
}
