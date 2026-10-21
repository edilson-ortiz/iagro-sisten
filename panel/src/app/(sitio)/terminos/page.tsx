import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Términos de Servicio — Iagro' },
  description: 'Términos y condiciones de uso de los servicios de Iagro: estaciones meteorológicas, pluviómetros digitales, app Iagro Clima y notificaciones por WhatsApp.',
};

export default function Pagina() {
  return (
    <>
      <section className="legal-hero">
        <div className="container">
          <span className="eyebrow">Documento legal</span>
          <h1>Términos de Servicio</h1>
          <p className="updated">Última actualización: 20 de octubre de 2026</p>
        </div>
      </section>

      <section className="legal-body">
        <div className="container legal-layout">

          <aside className="legal-toc">
            <h4>Contenido</h4>
            <a href="#aceptacion">1. Aceptación de los términos</a>
            <a href="#descripcion">2. Descripción del servicio</a>
            <a href="#cuenta">3. Cuenta y uso de la app</a>
            <a href="#equipos">4. Instalación y uso de equipos</a>
            <a href="#whatsapp-terminos">5. Notificaciones por WhatsApp</a>
            <a href="#obligaciones">6. Obligaciones del usuario</a>
            <a href="#propiedad">7. Propiedad intelectual</a>
            <a href="#limitacion">8. Limitación de responsabilidad</a>
            <a href="#disponibilidad">9. Disponibilidad del servicio</a>
            <a href="#pagos">10. Pagos y facturación</a>
            <a href="#terminacion">11. Terminación del servicio</a>
            <a href="#modificaciones">12. Modificaciones</a>
            <a href="#ley">13. Ley aplicable</a>
            <a href="#contacto-terminos">14. Contacto</a>
          </aside>

          <article className="legal-content">

            <h2 id="aceptacion">1. Aceptación de los términos</h2>
            <p>Estos Términos de Servicio regulan el uso de los productos y servicios de <strong>Iagro 360</strong>, emprendimiento de <strong>Edilson Ortiz Serrano</strong> (NIT 9674845011, Santa Cruz de la Sierra, Bolivia), en adelante «Iagro»: estaciones meteorológicas, pluviómetros digitales, la aplicación móvil <strong>Iagro Clima</strong> y el canal de notificaciones por WhatsApp. Al contratar nuestros equipos o usar la app, aceptás estos términos en su totalidad.</p>

            <h2 id="descripcion">2. Descripción del servicio</h2>
            <p>Iagro provee:</p>
            <ul>
              <li>Venta e instalación de estaciones meteorológicas y pluviómetros digitales para uso agrícola</li>
              <li>Una red de monitoreo que transmite datos de lluvia, humedad y condiciones ambientales en tiempo real</li>
              <li>La aplicación móvil Iagro Clima, para visualizar datos en vivo, históricos y pronósticos</li>
              <li>Notificaciones automáticas por WhatsApp asociadas a los datos de tu estación</li>
            </ul>

            <h2 id="cuenta">3. Cuenta y uso de la app</h2>
            <p>Para usar la app Iagro Clima podés necesitar crear una cuenta asociada a tu número de teléfono o correo electrónico. Sos responsable de mantener la confidencialidad de tus credenciales de acceso y de toda actividad realizada desde tu cuenta.</p>

            <h2 id="equipos">4. Instalación y uso de equipos</h2>
            <p>La instalación de estaciones y pluviómetros se realiza en la ubicación que el cliente indique. El cliente es responsable de:</p>
            <ul>
              <li>Brindar acceso seguro al predio para la instalación y mantenimiento del equipo</li>
              <li>No manipular, desconectar o reubicar el equipo sin coordinarlo con Iagro, ya que esto puede afectar la precisión de los datos</li>
              <li>Reportar fallas o daños del equipo a la brevedad posible</li>
            </ul>
            <p>Iagro no garantiza la exactitud absoluta de las mediciones ni de los pronósticos, ya que dependen de condiciones ambientales y de terceros proveedores de datos meteorológicos. La información se entrega como apoyo a la decisión del productor, no como garantía de resultado agrícola.</p>

            <h2 id="whatsapp-terminos">5. Notificaciones por WhatsApp</h2>
            <p>Al aceptar recibir notificaciones por WhatsApp, autorizás a Iagro a enviarte mensajes automáticos relacionados con tu estación, alertas climáticas y comunicaciones de soporte a través de la API de WhatsApp Business de Meta. Podés darte de baja en cualquier momento respondiendo "BAJA" o "STOP", o contactándonos directamente.</p>
            <p>El uso de WhatsApp para este servicio está sujeto también a los Términos de Servicio de WhatsApp/Meta.</p>

            <h2 id="obligaciones">6. Obligaciones del usuario</h2>
            <p>Al usar nuestros servicios, te comprometés a:</p>
            <ul>
              <li>Proporcionar información de contacto veraz y actualizada</li>
              <li>Usar la app y el servicio de notificaciones de forma lícita</li>
              <li>No intentar acceder sin autorización a la infraestructura, datos de otros usuarios o sistemas de Iagro</li>
              <li>No revender ni redistribuir los datos del servicio sin autorización previa por escrito</li>
            </ul>

            <h2 id="propiedad">7. Propiedad intelectual</h2>
            <p>La marca Iagro, el logo, la app Iagro Clima, su diseño, código y contenido son propiedad de Iagro. Los datos generados por tu propio equipo (mediciones de tu parcela) te pertenecen a vos como cliente; Iagro los procesa y almacena para prestarte el servicio.</p>

            <h2 id="limitacion">8. Limitación de responsabilidad</h2>
            <p>Iagro no será responsable por pérdidas o daños derivados de: decisiones agrícolas tomadas en base a los datos o pronósticos provistos, interrupciones del servicio por causas de fuerza mayor, fallas de conectividad de terceros (incluyendo WhatsApp/Meta), o uso indebido del equipo por parte del cliente.</p>

            <h2 id="disponibilidad">9. Disponibilidad del servicio</h2>
            <p>Hacemos lo posible por mantener el servicio disponible de forma continua, pero no garantizamos disponibilidad ininterrumpida. Pueden existir mantenimientos programados o interrupciones por causas ajenas a Iagro, incluyendo caídas del servicio de WhatsApp/Meta o de conectividad de internet en la zona del equipo.</p>

            <h2 id="pagos">10. Pagos y facturación</h2>
            <p>Las condiciones de pago por equipos, instalación y suscripción al servicio (si aplica) se acuerdan de forma particular con cada cliente al momento de la contratación, y se detallan en la cotización o contrato correspondiente.</p>

            <h2 id="terminacion">11. Terminación del servicio</h2>
            <p>Cualquiera de las partes puede dar por terminado el servicio según lo acordado en el contrato comercial correspondiente. Iagro se reserva el derecho de suspender el acceso a la app o a las notificaciones en caso de uso indebido o incumplimiento de estos términos.</p>

            <h2 id="modificaciones">12. Modificaciones</h2>
            <p>Iagro puede actualizar estos Términos de Servicio para reflejar cambios en el servicio o en la normativa aplicable. Te notificaremos cambios relevantes a través de la app, WhatsApp o correo electrónico cuando corresponda.</p>

            <h2 id="ley">13. Ley aplicable</h2>
            <p>Estos términos se rigen por las leyes del Estado Plurinacional de Bolivia. Cualquier controversia será resuelta ante los tribunales competentes de Santa Cruz de la Sierra, Bolivia.</p>

            <h2 id="contacto-terminos">14. Contacto</h2>
            <p>Para consultas sobre estos Términos de Servicio, escribinos:</p>
            <ul>
              <li>Titular: <strong>Edilson Ortiz Serrano</strong> (Iagro 360) · NIT 9674845011</li>
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
