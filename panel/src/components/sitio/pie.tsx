/** Pie del sitio público */
export function Pie() {
  return (
    <footer>
      <div className="container">
        <div className="footer-grid">
          <div>
            <div className="footer-brand"><img src="/img/logo.png" alt="Iagro" /> Iagro</div>
            <p>Red de pluviómetros digitales y estaciones meteorológicas conectadas para el agro, con notificaciones por WhatsApp y la app Iagro Clima.</p>
          </div>
          <div className="footer-col">
            <h4>Empresa</h4>
            <a href="/#servicios">Servicios</a>
            <a href="/#como-funciona">Cómo funciona</a>
            <a href="/radar">Radar</a>
            <a href="/contacto">Contacto</a>
          </div>
          <div className="footer-col">
            <h4>Legal</h4>
            <a href="/privacidad">Política de privacidad</a>
            <a href="/terminos">Términos de servicio</a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 Iagro. Todos los derechos reservados.</span>
          <span>Santa Cruz, Bolivia</span>
        </div>
      </div>
    </footer>
  );
}
