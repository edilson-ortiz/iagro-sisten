/**
 * Al iniciar el servidor: arranca el trabajador de difusiones (envíos programados y estados).
 * Llama cada 15 s a /panel/api/trabajador dentro del mismo proceso, con un token aleatorio que
 * solo conoce este proceso (así ese endpoint no se puede disparar desde afuera).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { randomBytes } = await import('node:crypto');
  process.env.TRABAJADOR_TOKEN = randomBytes(24).toString('hex');

  const url = `http://127.0.0.1:${process.env.PORT || 3000}/panel/api/trabajador`;
  const ciclo = async () => {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'x-trabajador': process.env.TRABAJADOR_TOKEN! },
        signal: AbortSignal.timeout(120_000),
      });
    } catch {
      // el servidor todavía arranca o está ocupado: se reintenta en el próximo ciclo
    }
  };
  setTimeout(() => { void ciclo(); setInterval(ciclo, 15_000); }, 10_000);
}
