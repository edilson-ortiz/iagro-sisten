import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from '@/components/providers';
import '../globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: { default: 'IAGRO Panel', template: '%s · IAGRO Panel' },
  description: 'Administración del bot de alertas de clima IAGRO',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7faf8' },
    { media: '(prefers-color-scheme: dark)', color: '#111714' },
  ],
};

export default function PanelRaizLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${inter.variable} min-h-dvh bg-background font-sans text-foreground`}>
      <Providers>{children}</Providers>
    </div>
  );
}
