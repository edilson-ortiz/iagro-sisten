import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone', // imagen Docker liviana
  poweredByHeader: false,
  serverExternalPackages: ['pg'],
  // Crear una difusión envía hasta 100.000 contactos de una vez (el límite por defecto es 1 MB)
  experimental: { serverActions: { bodySizeLimit: '30mb' } },

  async rewrites() {
    return [
      // Web del clima (HTML estático en public/clima)
      { source: '/clima', destination: '/clima/index.html' },
      // URLs registradas en Meta (WhatsApp Business): responden directo, sin redirección
      { source: '/privacidad.html', destination: '/privacidad' },
      { source: '/terminos.html', destination: '/terminos' },
    ];
  },

  async redirects() {
    // Direcciones del sitio estático anterior (enlaces compartidos, QR impresos)
    return [
      { source: '/register', destination: '/registro', permanent: true },
      { source: '/register.html', destination: '/registro', permanent: true },
      { source: '/radar.html', destination: '/radar', permanent: true },
      { source: '/index.html', destination: '/', permanent: true },
      { source: '/contacto.html', destination: '/contacto', permanent: true },
    ];
  },
};

export default nextConfig;
