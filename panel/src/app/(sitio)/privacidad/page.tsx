import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Política de Privacidad — Iagro' },
  description: 'Política de privacidad de Iagro: cómo recolectamos, usamos y protegemos tus datos, incluyendo el uso de la API de WhatsApp Business para notificaciones.',
};

export default function Pagina() {
  return (
    <>
      <section className="legal-hero">
        <div className="container">
          <span className="eyebrow">Documento legal</span>
          <h1>Política de Privacidad</h1>
          <p className="updated">Última actualización: 20 de octubre de 2026</p>
        </div>
      </section>

      <section className="legal-body">
        <div className="container legal-layout">

          <aside className="legal-toc">
            <h4>Contenido</h4>
            <a href="#intro">1. Introducción</a>
            <a href="#responsable">2. Responsable del tratamiento</a>
            <a href="#datos-recolectados">3. Datos que recolectamos</a>
            <a href="#whatsapp">4. Uso de la API de WhatsApp Business</a>
            <a href="#finalidad">5. Finalidad del tratamiento</a>
            <a href="#base-legal">6. Base legal</a>
            <a href="#comparticion">7. Con quién compartimos datos</a>
            <a href="#conservacion">8. Conservación de datos</a>
            <a href="#seguridad">9. Seguridad de la información</a>
            <a href="#derechos">10. Tus derechos</a>
            <a href="#eliminacion">11. Eliminación de datos</a>
            <a href="#menores">12. Menores de edad</a>
            <a href="#cambios">13. Cambios a esta política</a>
            <a href="#contacto-legal">14. Contacto</a>
          </aside>

          <article className="legal-content">

            <h2 id="intro">1. Introducción</h2>
            <p>En <strong>Iagro</strong> operamos una red de estaciones meteorológicas y pluviómetros digitales para el sector agrícola, junto con la aplicación móvil <strong>Iagro Clima</strong> y un servicio de notificaciones a través de WhatsApp. Esta Política de Privacidad explica qué datos recolectamos, cómo los usamos, con quién los compartimos y qué derechos tenés sobre tu información.</p>
            <p>Al usar nuestros equipos, la app Iagro Clima o nuestro canal de WhatsApp, aceptás las prácticas descritas en este documento.</p>

            <h2 id="responsable">2. Responsable del tratamiento</h2>
            <p>El responsable del tratamiento de los datos personales descritos en esta política es <strong>Edilson Ortiz Serrano</strong>, NIT <strong>9674845011</strong>, titular del emprendimiento <strong>Iagro 360</strong>, con domicilio en Santa Cruz de la Sierra, Bolivia.</p>

            <h2 id="datos-recolectados">3. Datos que recolectamos</h2>
            <p>Recolectamos distintos tipos de datos según cómo interactúes con nosotros:</p>
            <h3>3.1 Datos que nos das directamente</h3>
            <ul>
              <li>Nombre y apellido</li>
              <li>Número de teléfono / WhatsApp</li>
              <li>Correo electrónico</li>
              <li>Ubicación de la parcela o finca donde se instala el equipo</li>
              <li>Información de contacto adicional que nos compartas por formulario, email o WhatsApp</li>
            </ul>
            <h3>3.2 Datos generados por los equipos</h3>
            <ul>
              <li>Mediciones de lluvia, humedad y condiciones ambientales registradas por el pluviómetro o estación meteorológica</li>
              <li>Identificador del dispositivo y estado de conexión</li>
              <li>Marca de tiempo de cada lectura</li>
            </ul>
            <h3>3.3 Datos de uso de la app y WhatsApp</h3>
            <ul>
              <li>Mensajes que nos enviás a través de WhatsApp para soporte o consultas</li>
              <li>Preferencias de notificación (qué alertas querés recibir y con qué frecuencia)</li>
              <li>Datos técnicos básicos del dispositivo móvil al usar la app Iagro Clima (modelo, sistema operativo, identificador de instalación)</li>
            </ul>

            <h2 id="whatsapp">4. Uso de la API de WhatsApp Business</h2>
            <p>Iagro utiliza la <strong>API de WhatsApp Business de Meta</strong> para enviarte notificaciones automáticas relacionadas con tu estación meteorológica o pluviómetro, por ejemplo: alertas de lluvia, resúmenes de datos, avisos de mantenimiento del equipo o respuestas a tus consultas.</p>
            <p>Para que este servicio funcione, compartimos con Meta (a través de la infraestructura de la API de WhatsApp Business) la siguiente información, estrictamente necesaria para la entrega de mensajes:</p>
            <ul>
              <li>Tu número de teléfono asociado a WhatsApp</li>
              <li>El contenido de los mensajes y notificaciones que te enviamos</li>
              <li>Metadatos técnicos del mensaje (estado de entrega, hora de envío)</li>
            </ul>
            <div className="legal-note">Meta procesa estos datos conforme a su propia Política de Privacidad y a los Términos de Servicio de WhatsApp Business. Iagro no controla cómo Meta procesa internamente esta información en su infraestructura; te recomendamos revisar las políticas de privacidad de WhatsApp/Meta para más detalle.</div>
            <p>Podés dejar de recibir notificaciones por WhatsApp en cualquier momento respondiendo "BAJA" o "STOP" al chat, o contactándonos directamente por los medios indicados en la sección de contacto.</p>

            <h2 id="finalidad">5. Finalidad del tratamiento</h2>
            <p>Usamos tus datos para:</p>
            <ul>
              <li>Instalar, configurar y dar mantenimiento a tu estación o pluviómetro digital</li>
              <li>Enviarte notificaciones de clima, lluvia y alertas relevantes para tu cultivo</li>
              <li>Mostrarte tus datos en tiempo real, históricos y pronósticos dentro de la app Iagro Clima</li>
              <li>Responder tus consultas de soporte por WhatsApp, email o formulario de contacto</li>
              <li>Mejorar nuestros equipos, la app y la precisión de los pronósticos</li>
              <li>Cumplir obligaciones legales o contractuales aplicables</li>
            </ul>

            <h2 id="base-legal">6. Base legal</h2>
            <p>Tratamos tus datos en base a: (i) la ejecución del contrato de servicio que aceptás al contratar una estación o la app Iagro Clima; (ii) tu consentimiento explícito para recibir notificaciones por WhatsApp; y (iii) nuestro interés legítimo en mejorar el servicio y garantizar su correcto funcionamiento.</p>

            <h2 id="comparticion">7. Con quién compartimos datos</h2>
            <p>No vendemos tus datos personales. Los compartimos únicamente con:</p>
            <table>
              <thead>
                <tr><th>Tercero</th><th>Motivo</th></tr>
              </thead>
              <tbody>
                <tr><td>Meta / WhatsApp Business API</td><td>Envío de notificaciones y mensajes automáticos</td></tr>
                <tr><td>Proveedores de hosting y servidores</td><td>Almacenamiento de datos de las estaciones y la app</td></tr>
                <tr><td>Proveedores de servicios de pronóstico meteorológico</td><td>Cruce de datos para generar pronósticos locales</td></tr>
                <tr><td>Autoridades competentes</td><td>Solo cuando exista una obligación legal de hacerlo</td></tr>
              </tbody>
            </table>

            <h2 id="conservacion">8. Conservación de datos</h2>
            <p>Conservamos los datos de mediciones (lluvia, humedad, históricos) mientras mantengas un equipo activo con nosotros, para que puedas consultar tu historial por campaña agrícola. Los datos de contacto se conservan mientras exista una relación comercial activa o hasta que solicites su eliminación.</p>

            <h2 id="seguridad">9. Seguridad de la información</h2>
            <p>Aplicamos medidas técnicas y organizativas razonables para proteger tus datos contra accesos no autorizados, pérdida o alteración, incluyendo conexiones cifradas (HTTPS) y control de acceso a nuestras bases de datos.</p>

            <h2 id="derechos">10. Tus derechos</h2>
            <p>Podés solicitarnos en cualquier momento:</p>
            <ul>
              <li>Acceder a los datos personales que tenemos sobre vos</li>
              <li>Corregir datos inexactos o desactualizados</li>
              <li>Solicitar la eliminación de tus datos</li>
              <li>Oponerte al uso de tus datos para ciertas finalidades</li>
              <li>Revocar tu consentimiento para recibir notificaciones por WhatsApp</li>
            </ul>
            <p>Para ejercer estos derechos, escribinos a <strong>serranoluizedil@gmail.com</strong> o por WhatsApp al <strong>+591 76871405</strong>.</p>

            <h2 id="eliminacion">11. Eliminación de datos</h2>
            <p>Si querés que eliminemos tus datos personales y el historial asociado a tu número de WhatsApp o cuenta de la app Iagro Clima, enviá una solicitud a <strong>serranoluizedil@gmail.com</strong> con el asunto "Eliminación de datos", indicando tu nombre completo y el número de teléfono registrado. Procesaremos la solicitud en un plazo razonable y te confirmaremos por el mismo medio una vez completada.</p>

            <h2 id="menores">12. Menores de edad</h2>
            <p>Nuestros servicios están dirigidos a productores agrícolas y empresas, no a menores de edad. No recolectamos intencionalmente datos de menores de 18 años.</p>

            <h2 id="cambios">13. Cambios a esta política</h2>
            <p>Podemos actualizar esta Política de Privacidad para reflejar cambios en nuestros servicios o en la normativa aplicable. La fecha de "última actualización" en la parte superior indica la versión vigente.</p>

            <h2 id="contacto-legal">14. Contacto</h2>
            <p>Si tenés preguntas sobre esta política o sobre el tratamiento de tus datos, contactanos:</p>
            <ul>
              <li>Responsable: <strong>Edilson Ortiz Serrano</strong> (Iagro 360) · NIT 9674845011</li>
              <li>Email: <strong>serranoluizedil@gmail.com</strong></li>
              <li>WhatsApp: <strong>+591 76871405</strong></li>
              <li>Dirección: Santa Cruz de la Sierra, Bolivia</li>
            </ul>

          </article>
        </div>
      </section>
    </>
  );
}
