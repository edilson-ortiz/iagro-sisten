/** Encabezado del sitio público (igual en todas las páginas) */
export function Cabecera() {
  return (
    <header className="site-header">
      <div className="container">
        <a href="/" className="brand">
          <img src="/img/logo.png" alt="Iagro" />
          <span>Iagro<span className="sub">Clima &amp; Agro Data</span></span>
        </a>
        <nav className="nav-links">
          <a href="/#servicios">Servicios</a>
          <a href="/#como-funciona">Cómo funciona</a>
          <a href="/#app">App Iagro Clima</a>
          <a href="/contacto">Contacto</a>
          <a href="/radar">Radar</a>
          <a href="/contacto#whatsapp" className="cta-link">Hablar por WhatsApp</a>
        </nav>
        {/* Fuera del menú: en celular el menú se oculta y el acceso tiene que seguir visible */}
        <a href="/panel/login" className="login-link">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
          </svg>
          Ingresar
        </a>
      </div>
    </header>
  );
}
