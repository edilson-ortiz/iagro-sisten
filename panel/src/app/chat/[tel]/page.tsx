import type { Metadata } from 'next';
import { confChatWeb, firmaValida } from '@/lib/chat-web';
import { Chat } from './chat';
import s from './chat.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { absolute: 'IAGRO · Chat' },
  icons: { icon: '/img/logo.png' },
  robots: { index: false, follow: false },
};

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

export default async function ChatPage({ params, searchParams }: {
  params: Promise<{ tel: string }>; searchParams: Promise<{ k?: string }>;
}) {
  const { tel } = await params;
  const { k } = await searchParams;
  if (!firmaValida(tel, k)) {
    return <Aviso titulo="Enlace no válido" texto="Pide a IAGRO que te envíe de nuevo el enlace de tu chat." />;
  }
  const c = await confChatWeb();
  if ('error' in c) {
    return <Aviso titulo="Chat no disponible" texto="El chat está en mantenimiento. Inténtalo más tarde." />;
  }
  return <Chat telefono={tel} firma={k!} />;
}
