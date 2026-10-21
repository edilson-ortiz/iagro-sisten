import type { Metadata } from 'next';
import { FormContacto } from '@/components/sitio/form-contacto';

export const metadata: Metadata = {
  title: { absolute: 'Contacto — Iagro' },
  description: 'Contactá a Iagro por WhatsApp o email. Estamos en Santa Cruz de la Sierra, Bolivia. Consultanos por estaciones meteorológicas y pluviómetros digitales.',
};

export default function Pagina() {
  return (
    <>
      <section className="legal-hero">
        <div className="container">
          <span className="eyebrow">Contacto</span>
          <h1>Hablemos del clima de tu finca</h1>
          <p className="updated" style={{ fontFamily: 'var(--font-body)', fontSize: '1rem', maxWidth: '56ch' }}>Contanos dónde está tu parcela y qué necesitás monitorear. Te respondemos por WhatsApp o email en menos de 24 horas hábiles.</p>
        </div>
      </section>

      <section className="legal-body">
        <div className="container contact-page-grid">

          <div className="form-card">
            <h3 style={{ marginBottom: '22px' }}>Envianos un mensaje</h3>
            <FormContacto />
          </div>

          <div>
            <div className="contact-card" style={{ marginBottom: '24px' }}>
              <div className="contact-list">
                <div className="contact-item">
                  <div className="ci-icon"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 6 12 13 2 6" /><path d="M2 6h20v12H2z" /></svg></div>
                  <div><div className="ci-label">Email</div><div className="ci-value">serranoluizedil@gmail.com</div></div>
                </div>
                <div className="contact-item" id="whatsapp">
                  <div className="ci-icon"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg></div>
                  <div><div className="ci-label">WhatsApp</div><div className="ci-value"><a href="https://wa.me/59176871405" target="_blank" rel="noopener">+591 76871405</a></div></div>
                </div>
              </div>
            </div>

            <div className="contact-card" style={{ marginBottom: '24px' }}>
              <h3 style={{ marginBottom: '14px' }}>Datos legales</h3>
              <div className="contact-list">
                <div className="contact-item"><div><div className="ci-label">Razón social</div><div className="ci-value">Edilson Ortiz Serrano</div></div></div>
                <div className="contact-item"><div><div className="ci-label">NIT</div><div className="ci-value">9674845011</div></div></div>
                <div className="contact-item"><div><div className="ci-label">Emprendimiento</div><div className="ci-value">Iagro 360</div></div></div>
                <div className="contact-item"><div><div className="ci-label">Dirección</div><div className="ci-value">Santa Cruz de la Sierra, Bolivia</div></div></div>
              </div>
            </div>

            <a href="https://wa.me/59176871405" target="_blank" rel="noopener" className="wa-band" style={{ display: 'flex', textDecoration: 'none', marginBottom: '24px' }}>
              <div>
                <h3>Escribinos directo por WhatsApp</h3>
                <p>Respuesta rápida para consultas sobre instalación y precios.</p>
              </div>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="#fff" style={{ flexShrink: '0' }}><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.39 1.27 4.81L2 22l5.43-1.36a9.85 9.85 0 0 0 4.61 1.17h.01c5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2z" /></svg>
            </a>

            <div className="map-frame">
              <iframe src="https://www.openstreetmap.org/export/embed.html?bbox=-63.20%2C-17.76%2C-63.13%2C-17.70&layer=mapnik" loading="lazy" referrerPolicy="no-referrer-when-downgrade" title="Ubicación Iagro Santa Cruz"></iframe>
            </div>
          </div>

        </div>
      </section>
    </>
  );
}
