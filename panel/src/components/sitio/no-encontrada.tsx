/** Contenido de la página 404 del sitio */
export function NoEncontrada() {
  return (
    <>
      <section style={{ padding: '120px 0', textAlign: 'center' }}>
        <div className="container">
          <span className="eyebrow">Error 404</span>
          <h1 style={{ marginTop: '16px' }}>Esta página no existe</h1>
          <p style={{ color: 'var(--ink-soft)', margin: '16px auto 32px', maxWidth: '50ch' }}>El enlace que seguiste no corresponde a ninguna página de Iagro. Volvé al inicio o contactanos si crees que esto es un error.</p>
          <a href="/" className="btn btn-primary">Volver al inicio</a>
        </div>
      </section>
    </>
  );
}
