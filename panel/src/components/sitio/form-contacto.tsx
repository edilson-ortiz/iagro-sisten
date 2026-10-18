'use client';

/** Formulario de contacto: arma un mensaje de WhatsApp con los datos (antes js/main.js) */
export function FormContacto() {
  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (k: string) => String(f.get(k) ?? '').trim();
    const partes = [
      `Hola Iagro, soy ${v('nombre')}.`,
      v('telefono') ? `Mi contacto: ${v('telefono')}` : '',
      v('email') ? `Email: ${v('email')}` : '',
      v('ubicacion') ? `Ubicación de mi parcela: ${v('ubicacion')}` : '',
      v('mensaje') ? `Detalle: ${v('mensaje')}` : '',
    ].filter(Boolean).join('\n');
    window.open(`https://wa.me/59176871405?text=${encodeURIComponent(partes)}`, '_blank', 'noopener');
  }

  return (
    <form id="contact-form" onSubmit={enviar}>
      <div className="field">
        <label htmlFor="nombre">Nombre completo</label>
        <input type="text" id="nombre" name="nombre" placeholder="Tu nombre y apellido" required />
      </div>
      <div className="field">
        <label htmlFor="telefono">WhatsApp / Teléfono</label>
        <input type="tel" id="telefono" name="telefono" placeholder="+591 ..." required />
      </div>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input type="email" id="email" name="email" placeholder="tu@email.com" />
      </div>
      <div className="field">
        <label htmlFor="ubicacion">Ubicación de la parcela</label>
        <input type="text" id="ubicacion" name="ubicacion" placeholder="Departamento, municipio o zona" />
      </div>
      <div className="field">
        <label htmlFor="mensaje">Contanos qué necesitás</label>
        <textarea id="mensaje" name="mensaje" placeholder="Tipo de cultivo, tamaño de la parcela, qué te gustaría monitorear..."></textarea>
      </div>
      <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>Enviar mensaje</button>
      <p className="form-note">Al enviar este formulario aceptás nuestra <a href="/privacidad" style={{ color: 'var(--azure)', textDecoration: 'underline' }}>Política de Privacidad</a>. Te contactaremos solo para responder tu consulta.</p>
    </form>
  );
}
