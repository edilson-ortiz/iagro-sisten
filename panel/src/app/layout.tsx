/**
 * Raíz común. El sitio público (app/(sitio), /radar, /registro) y el panel (app/panel)
 * cargan cada uno su propio CSS y tipografías desde su layout.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
