import type { Metadata } from 'next';
import { query, sql } from '@/lib/db';
import { confChatWeb, firmaValida } from '@/lib/chat-web';
import { Chat, type Cliente } from './chat';
import s from './chat.module.css';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ tel: string }>; searchParams: Promise<{ k?: string; r?: string }> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { tel } = await params;
  const { k } = await searchParams;
  return {
    title: { absolute: 'IAGRO Clima' },
    description: 'Pronóstico, radar y alertas de lluvia para tu campo.',
    icons: { icon: '/img/app-192.png', apple: '/img/app-apple-180.png' },
    robots: { index: false, follow: false },
    // App instalable: el manifest es de este cliente (abre su propio chat)
    manifest: firmaValida(tel, k) ? `/chat/${tel}/manifest.webmanifest?k=${encodeURIComponent(k!)}` : undefined,
    appleWebApp: { capable: true, title: 'IAGRO', statusBarStyle: 'default' },
  };
}

export const viewport = { themeColor: '#008069', interactiveWidget: 'resizes-content' };

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <main className={s.aviso}>
      <img src="/img/logo.png" alt="" width={72} height={72} />
      <h1>{titulo}</h1>
      <p>{texto}</p>
    </main>
  );
}

export default async function ChatPage({ params, searchParams }: Props) {
  const { tel } = await params;
  const { k, r } = await searchParams;
  if (!firmaValida(tel, k)) {
    return <Aviso titulo="Enlace no válido" texto="Pide a IAGRO que te envíe de nuevo el enlace de tu chat." />;
  }
  const c = await confChatWeb();
  if ('error' in c) {
    return <Aviso titulo="Chat no disponible" texto="El chat está en mantenimiento. Inténtalo más tarde." />;
  }
  // Cliente registrado: su radar personal en los estados de IAGRO
  const [u] = await query<Cliente>(sql`
    SELECT id, nombre, latitud AS lat, longitud AS lon FROM bot_clima.usuarios WHERE telefono = ${tel} LIMIT 1`);
  // r = código de invitación de un amigo (llegó por WhatsApp → botón "Ver pronóstico")
  const invitacion = r && /^[a-z0-9]{4,8}$/i.test(r) ? r.toUpperCase() : null;
  return <Chat telefono={tel} firma={k!} cliente={u ?? null} invitacion={invitacion} />;
}
