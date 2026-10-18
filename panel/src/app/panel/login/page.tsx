import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { obtenerSesion } from '@/lib/auth';
import { Logo } from '@/components/logo';
import { FormLogin } from './form-login';

export const metadata: Metadata = { title: 'Iniciar sesión' };

export default async function LoginPage() {
  if (await obtenerSesion()) redirect('/panel');

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[radial-gradient(ellipse_at_top,var(--color-accent),transparent_60%)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          <h1 className="text-xl font-semibold">Iniciar sesión</h1>
          <p className="mt-1 mb-6 text-sm text-muted-foreground">Acceso solo para administradores.</p>
          <FormLogin />
        </div>
      </div>
    </main>
  );
}
