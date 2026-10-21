import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Iagro — Red de pluviómetros digitales y clima en tiempo real para el agro' },
  description: 'Iagro instala estaciones meteorológicas y pluviómetros digitales conectados, con notificaciones por WhatsApp y la app Iagro Clima. Datos en tiempo real, pronósticos e históricos para tu finca.',
};

export default function Pagina() {
  return (
    <>
      <section className="hero">
        <div className="container">
          <div className="hero-copy">
            <span className="eyebrow">Red de pluviómetros digitales</span>
            <h1>El clima de tu finca, <em>en tiempo real</em>, directo a tu WhatsApp</h1>
            <p className="lead">Instalamos estaciones meteorológicas y pluviómetros digitales conectados que miden lluvia, humedad y condiciones del cultivo — y te avisan al instante por WhatsApp y por nuestra app Iagro Clima.</p>
            <div className="hero-actions">
              <a href="/contacto" className="btn btn-primary">Solicitar una estación</a>
              <a href="#como-funciona" className="btn btn-secondary">Ver cómo funciona</a>
            </div>
          </div>
          <div className="hero-visual">
            <svg className="raingauge" viewBox="0 0 360 420" xmlns="http://www.w3.org/2000/svg">
              {/* Pulsos de señal */}
              <circle className="pulse-ring" cx="180" cy="120" r="34" fill="none" stroke="#2E86C1" strokeWidth="2" />
              <circle className="pulse-ring" cx="180" cy="120" r="34" fill="none" stroke="#7EC8E3" strokeWidth="2" style={{ animationDelay: '1s' }} />

              {/* Nube */}
              <g>
                <ellipse cx="180" cy="118" rx="72" ry="34" fill="#1B2A4A" />
                <ellipse cx="140" cy="106" rx="38" ry="28" fill="#1B2A4A" />
                <ellipse cx="222" cy="106" rx="40" ry="30" fill="#1B2A4A" />
              </g>

              {/* Gotas cayendo */}
              <g fill="#7EC8E3">
                <path className="drop" d="M150 150 q6 14 0 22 q-6 -2 -6 -10 q0 -6 6 -12" />
                <path className="drop" d="M180 150 q6 14 0 22 q-6 -2 -6 -10 q0 -6 6 -12" />
                <path className="drop" d="M210 150 q6 14 0 22 q-6 -2 -6 -10 q0 -6 6 -12" />
                <path className="drop" d="M165 160 q6 14 0 22 q-6 -2 -6 -10 q0 -6 6 -12" />
                <path className="drop" d="M195 160 q6 14 0 22 q-6 -2 -6 -10 q0 -6 6 -12" />
              </g>

              {/* Pluviómetro digital */}
              <g transform="translate(140,250)">
                <rect x="0" y="0" width="80" height="110" rx="10" fill="#FFFFFF" stroke="#1B2A4A" strokeWidth="3" />
                <rect x="10" y="14" width="60" height="34" rx="5" fill="#11192E" />
                <text x="40" y="36" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="13" fill="#94CC52" className="data-tick">24.6mm</text>
                <line x1="14" y1="62" x2="66" y2="62" stroke="#DCE3DD" strokeWidth="2" />
                <circle className="data-tick" cx="22" cy="76" r="4" fill="#7CB342" />
                <text x="34" y="80" fontFamily="JetBrains Mono, monospace" fontSize="9" fill="#4B5868">EN VIVO</text>
                <line x1="14" y1="92" x2="66" y2="92" stroke="#DCE3DD" strokeWidth="2" />
                <rect x="-6" y="100" width="92" height="10" rx="5" fill="#7CB342" />
              </g>

              {/* Base / suelo */}
              <ellipse cx="180" cy="392" rx="120" ry="10" fill="#7CB342" opacity="0.18" />

              {/* Ondas de transmisión hacia WhatsApp */}
              <g className="data-tick" style={{ animationDelay: '0.6s' }}>
                <circle cx="284" cy="240" r="3" fill="#7CB342" />
                <circle cx="296" cy="232" r="3" fill="#7CB342" />
                <circle cx="306" cy="222" r="3" fill="#7CB342" />
              </g>
            </svg>
          </div>
        </div>
      </section>

      <section className="stats">
        <div className="container">
          <div className="stat">
            <div className="num">100%</div>
            <div className="label">Datos en tiempo real</div>
          </div>
          <div className="stat">
            <div className="num">WhatsApp</div>
            <div className="label">Notificaciones automáticas</div>
          </div>
          <div className="stat">
            <div className="num">24/7</div>
            <div className="label">Monitoreo continuo</div>
          </div>
          <div className="stat">
            <div className="num">Bolivia</div>
            <div className="label">Santa Cruz y zonas agrícolas</div>
          </div>
        </div>
      </section>

      <section id="servicios">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Servicios</span>
            <h2>Una red conectada para entender el clima de tu cultivo</h2>
            <p>Combinamos hardware propio, conectividad y una app para que la información de tu campo te llegue antes de que la necesites.</p>
          </div>
          <div className="services-grid">

            <div className="service-card">
              <div className="service-icon">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 13v8M8 13v8M12 11v10M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25" /></svg>
              </div>
              <h3>Pluviómetros digitales</h3>
              <p>Equipos conectados que registran cada milímetro de lluvia caída en tu parcela, sin que tengas que revisarlos manualmente.</p>
            </div>

            <div className="service-card">
              <div className="service-icon">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
              </div>
              <h3>Notificaciones por WhatsApp</h3>
              <p>Recibí alertas de lluvia, riesgo de helada o cambios bruscos de humedad directo en tu teléfono, sin instalar nada extra.</p>
            </div>

            <div className="service-card">
              <div className="service-icon">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" /><line x1="12" y1="18" x2="12.01" y2="18" /></svg>
              </div>
              <h3>App Iagro Clima</h3>
              <p>Visualizá el estado de tus estaciones, históricos y pronósticos desde una sola aplicación móvil, pensada para el productor.</p>
            </div>

            <div className="service-card">
              <div className="service-icon">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M18.7 8 13 13.7l-4-4L3 16" /></svg>
              </div>
              <h3>Análisis en tiempo real</h3>
              <p>Tableros con datos actualizados al instante: lluvia acumulada, tendencias y comparación entre estaciones de tu red.</p>
            </div>

            <div className="service-card">
              <div className="service-icon">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
              </div>
              <h3>Históricos de lluvia</h3>
              <p>Consultá el registro acumulado por campaña agrícola para planificar siembra, riego y manejo del cultivo con datos propios.</p>
            </div>

            <div className="service-card">
              <div className="service-icon">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>
              </div>
              <h3>Pronóstico para tu zona</h3>
              <p>Cruzamos los datos de tu estación con pronóstico meteorológico local para anticipar decisiones de manejo.</p>
            </div>

          </div>
        </div>
      </section>

      <section id="como-funciona">
        <div className="container">
          <div className="flow">
            <div className="section-head">
              <span className="eyebrow">Cómo funciona</span>
              <h2>De la lluvia en tu campo a tu teléfono, en cuatro pasos</h2>
              <p>Así viaja el dato desde el pluviómetro hasta tu WhatsApp.</p>
            </div>
            <div className="flow-steps">
              <div className="flow-step">
                <span className="tag">PASO 1</span>
                <h4>Instalación</h4>
                <p>Instalamos la estación meteorológica o pluviómetro digital en el punto exacto de tu parcela.</p>
              </div>
              <div className="flow-step">
                <span className="tag">PASO 2</span>
                <h4>Medición continua</h4>
                <p>El equipo registra lluvia, humedad y condiciones del entorno de forma automática, las 24 horas.</p>
              </div>
              <div className="flow-step">
                <span className="tag">PASO 3</span>
                <h4>Transmisión</h4>
                <p>Los datos se envían en tiempo real a la plataforma Iagro y quedan disponibles en la app.</p>
              </div>
              <div className="flow-step">
                <span className="tag">PASO 4</span>
                <h4>Alerta al instante</h4>
                <p>Te llega la notificación por WhatsApp o la app, lista para que tomes la decisión a tiempo.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="app" className="app-promo">
        <div className="container">
          <div className="phone-mock">
            <div className="phone-screen">
              <div className="ps-head"><span>IAGRO CLIMA</span><span>EN VIVO</span></div>
              <div className="ps-card">
                <div className="ps-label">Lluvia acumulada — hoy</div>
                <div className="ps-value leaf">18.4 mm</div>
              </div>
              <div className="ps-card">
                <div className="ps-label">Humedad relativa</div>
                <div className="ps-value sky">76%</div>
              </div>
              <div className="ps-card">
                <div className="ps-label">Estación</div>
                <div className="ps-value" style={{ fontSize: '1.05rem' }}>Parcela Norte — E03</div>
              </div>
              <div className="ps-card">
                <div className="ps-label">Próxima alerta</div>
                <div className="ps-value" style={{ fontSize: '1.05rem' }}>Posible lluvia en 3h</div>
              </div>
            </div>
          </div>
          <div className="app-copy">
            <span className="eyebrow">App Iagro Clima</span>
            <h2>Toda tu red de estaciones, en una sola app</h2>
            <p style={{ color: 'var(--ink-soft)', marginTop: '14px' }}>Diseñada para el productor que necesita decidir rápido: riego, siembra, cosecha o protección del cultivo ante una helada o lluvia intensa.</p>
            <ul className="checklist">
              <li><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg> Datos en tiempo real de cada estación de tu finca</li>
              <li><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg> Histórico de lluvia por campaña agrícola</li>
              <li><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg> Pronóstico local cruzado con tus propios datos</li>
              <li><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg> Notificaciones automáticas por WhatsApp</li>
            </ul>
            <a href="/contacto" className="btn btn-primary" style={{ marginTop: '10px' }}>Quiero la app</a>
          </div>
        </div>
      </section>

      <section>
        <div className="container">
          <div className="wa-band">
            <div>
              <h3>¿Querés ver tus datos directo en WhatsApp?</h3>
              <p>Activamos las notificaciones de tu estación en minutos. Escribinos y te mostramos cómo funciona.</p>
            </div>
            <a href="https://wa.me/59176871405" target="_blank" rel="noopener" className="btn btn-primary">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.39 1.27 4.81L2 22l5.43-1.36a9.85 9.85 0 0 0 4.61 1.17h.01c5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2z" /></svg>
              Escribir por WhatsApp
            </a>
          </div>
        </div>
      </section>

      <section id="contacto-preview">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Contacto</span>
            <h2>Hablemos de tu finca</h2>
            <p>Contanos dónde está tu parcela y qué cultivo trabajás. Te proponemos la estación que mejor se ajusta.</p>
          </div>
          <div className="contact-grid">
            <div className="contact-card">
              <div className="contact-list">
                <div className="contact-item">
                  <div className="ci-icon"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4z" opacity="0" /><path d="M22 6 12 13 2 6" /><path d="M2 6h20v12H2z" /></svg></div>
                  <div><div className="ci-label">Email</div><div className="ci-value">serranoluizedil@gmail.com</div></div>
                </div>
                <div className="contact-item">
                  <div className="ci-icon"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg></div>
                  <div><div className="ci-label">WhatsApp</div><div className="ci-value">+591 76871405</div></div>
                </div>
                <div className="contact-item">
                  <div className="ci-icon"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg></div>
                  <div><div className="ci-label">Ubicación</div><div className="ci-value">Santa Cruz de la Sierra, Bolivia</div></div>
                </div>
              </div>
            </div>
            <div className="map-frame">
              <iframe src="https://www.openstreetmap.org/export/embed.html?bbox=-63.20%2C-17.76%2C-63.13%2C-17.70&layer=mapnik" loading="lazy" referrerPolicy="no-referrer-when-downgrade" title="Ubicación Iagro Santa Cruz"></iframe>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
