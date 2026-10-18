import type { Metadata, Viewport } from 'next';
import { Newsreader, Work_Sans } from 'next/font/google';
import { Registro } from './registro';

const titulo = Newsreader({ subsets: ['latin'], weight: ['400', '600'], variable: '--f-titulo' });
const texto = Work_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--f-texto' });

export const metadata: Metadata = {
  title: { absolute: 'iAgro · Regístrate al pronóstico del clima' },
  description: 'Marca tu campo en el mapa y recibe por WhatsApp el pronóstico y las alertas de lluvia de iAgro.',
  icons: { icon: '/img/logo.png' },
};

export const viewport: Viewport = { themeColor: '#1B3A5C', viewportFit: 'cover' };

/** Número de WhatsApp del asistente (con código de país, sin +) */
const WHATSAPP = '59176762207';

export default function RegistroPage() {
  return (
    <div className={`${titulo.variable} ${texto.variable}`}>
      <Registro whatsapp={WHATSAPP} />
    </div>
  );
}
