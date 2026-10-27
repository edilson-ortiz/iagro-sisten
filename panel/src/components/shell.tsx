'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTheme } from 'next-themes';
import {
  BellRingIcon, CloudRainIcon, CoinsIcon, SendIcon, HomeIcon, LogOutIcon, MegaphoneIcon, MenuIcon, MoonIcon, SettingsIcon, SunIcon,
  UsersIcon, MonitorIcon, MapIcon, SmartphoneIcon,
} from 'lucide-react';
import { Dialog, DialogTitle, SheetContent } from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/logo';
import { cn, iniciales } from '@/lib/utils';
import { salir } from '@/app/panel/login/actions';
import { MODULOS } from '@/lib/modulos';

const NAV = [
  { href: '/panel', label: 'Inicio', icon: HomeIcon },
  { href: '/panel/usuarios', label: 'Usuarios', icon: UsersIcon },
  { href: '/panel/mapa', label: 'Mapa de clientes', icon: MapIcon },
  { href: '/panel/app-web', label: 'App y notificaciones', icon: SmartphoneIcon },
  { href: '/panel/difusiones', label: 'Difusiones', icon: MegaphoneIcon, oculto: !MODULOS.difusiones },
  { href: '/panel/alertas', label: 'Alertas de lluvia', icon: CloudRainIcon },
  { href: '/panel/campanas', label: 'Difusiones', icon: SendIcon },
  { href: '/panel/consumo', label: 'Consumo', icon: CoinsIcon },
  { href: '/panel/configuracion', label: 'Configuración', icon: SettingsIcon },
].filter((n) => !n.oculto);

function Navegacion({ onNavegar }: { onNavegar?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="grid gap-1 px-3">
      {NAV.map(({ href, label, icon: Icon }) => {
        const activo = href === '/panel' ? pathname === '/panel' : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavegar}
            aria-current={activo ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent/60',
              activo && 'bg-sidebar-accent text-sidebar-accent-foreground',
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function MenuTema() {
  const { theme, setTheme } = useTheme();
  const opciones = [
    { v: 'light', label: 'Claro', icon: SunIcon },
    { v: 'dark', label: 'Oscuro', icon: MoonIcon },
    { v: 'system', label: 'Sistema', icon: MonitorIcon },
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Cambiar tema">
          <SunIcon className="dark:hidden" />
          <MoonIcon className="hidden dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        {opciones.map(({ v, label, icon: Icon }) => (
          <DropdownMenuItem key={v} onClick={() => setTheme(v)} className={cn(theme === v && 'font-semibold')}>
            <Icon /> {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Shell({ admin, children }: { admin: { nombre: string; usuario: string }; children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const router = useRouter();

  return (
    <div className="flex min-h-dvh">
      {/* Barra lateral (escritorio) */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex h-16 items-center px-6">
          <Logo />
        </div>
        <Navegacion />
        <div className="mt-auto p-4 text-xs text-muted-foreground">
          <BellRingIcon className="mr-1 inline size-3" /> Bot de alertas de clima
        </div>
      </aside>

      {/* Menú lateral (celular) */}
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <SheetContent>
          <DialogTitle className="sr-only">Menú</DialogTitle>
          <div className="flex h-16 items-center px-6">
            <Logo />
          </div>
          <Navegacion onNavegar={() => setAbierto(false)} />
        </SheetContent>
      </Dialog>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setAbierto(true)} aria-label="Abrir menú">
            <MenuIcon />
          </Button>
          <Logo className="lg:hidden" conTexto={false} />
          <div className="ml-auto flex items-center gap-1">
            <MenuTema />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="ml-1 flex size-9 cursor-pointer items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
                  aria-label="Cuenta"
                >
                  {iniciales(admin.nombre)}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>
                  {admin.nombre}
                  <span className="block text-xs font-normal text-muted-foreground">@{admin.usuario}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={async () => { await salir(); router.replace('/panel/login'); router.refresh(); }} className="text-destructive">
                  <LogOutIcon /> Cerrar sesión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

export function Encabezado({ titulo, descripcion, children }: { titulo: string; descripcion?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        {descripcion && <p className="mt-1 text-sm text-muted-foreground">{descripcion}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
