import localFont from 'next/font/local';

/**
 * Fuentes guardadas en el proyecto (subconjunto latino de Google Fonts).
 * Antes next/font/google las bajaba al compilar, pero Google cambió el formato de sus enlaces y el build
 * fallaba ("Cannot read properties of null (reading '1')" en next/font): así no depende de internet.
 */

// Panel
export const interPanel = localFont({ src: './inter.woff2', weight: '100 900', variable: '--font-inter', display: 'swap' });

// Radar (/radar/{id})
export const zillaRadar = localFont({
  src: [{ path: './zilla-slab-500.woff2', weight: '500' }, { path: './zilla-slab-700.woff2', weight: '700' }],
  variable: '--f-titulo', display: 'swap',
});
export const interRadar = localFont({ src: './inter.woff2', weight: '100 900', variable: '--f-texto', display: 'swap' });
export const monoRadar = localFont({
  src: [{ path: './ibm-plex-mono-400.woff2', weight: '400' }, { path: './ibm-plex-mono-500.woff2', weight: '500' }],
  variable: '--f-mono', display: 'swap',
});

// Registro (/registro)
export const tituloRegistro = localFont({ src: './newsreader.woff2', weight: '400 600', variable: '--f-titulo', display: 'swap' });
export const textoRegistro = localFont({ src: './work-sans.woff2', weight: '400 600', variable: '--f-texto', display: 'swap' });
