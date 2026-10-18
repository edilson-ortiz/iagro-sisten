'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { iniciarSesion, type EstadoLogin } from './actions';

export function FormLogin() {
  const [estado, accion, pendiente] = useActionState<EstadoLogin, FormData>(iniciarSesion, {});
  // Controlado: React limpia los formularios tras cada envío y no queremos perder el usuario
  const [usuario, setUsuario] = useState('');
  const router = useRouter();

  // Sesión creada: al inicio del panel (el router agrega /panel)
  useEffect(() => {
    if (estado.ok) { router.replace('/panel'); router.refresh(); }
  }, [estado.ok, router]);

  return (
    <form action={accion} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="usuario">Usuario</Label>
        <Input
          id="usuario" name="usuario" autoComplete="username" autoCapitalize="none" required autoFocus
          value={usuario} onChange={(e) => setUsuario(e.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {estado.error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {estado.error}
        </p>
      )}
      <Button type="submit" className="mt-2 w-full" disabled={pendiente || estado.ok}>
        {pendiente && <Loader2Icon className="animate-spin" />}
        Entrar
      </Button>
    </form>
  );
}
