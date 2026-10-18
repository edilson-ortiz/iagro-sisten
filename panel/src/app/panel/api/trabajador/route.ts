import { NextResponse } from 'next/server';
import { cicloDifusiones } from '@/lib/campanas/trabajador';

/**
 * Lo llama el propio panel cada 15 s (src/instrumentation.ts) con un token que solo existe en este proceso.
 * Envía las difusiones pendientes y actualiza sus estados.
 */
let corriendo = false;

export async function POST(req: Request) {
  const token = process.env.TRABAJADOR_TOKEN;
  if (!token || req.headers.get('x-trabajador') !== token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (corriendo) return NextResponse.json({ ocupado: true });
  corriendo = true;
  try {
    return NextResponse.json(await cicloDifusiones() ?? { ocupado: true });
  } catch (err) {
    console.error('[difusiones] ciclo', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  } finally {
    corriendo = false;
  }
}
