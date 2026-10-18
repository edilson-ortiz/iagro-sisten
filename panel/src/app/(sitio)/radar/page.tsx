import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Radar de lluvia — Iagro' },
  description: 'Cada productor registrado tiene su radar de lluvia personal, centrado en su campo. Te llega por WhatsApp.',
};

/** /radar sin id: qué es el radar y cómo obtener el tuyo (el radar de cada campo es /radar/{id}) */
export default function RadarInicio() {
  return (
    <section style={{ padding: '120px 0', textAlign: 'center' }}>
      <div className="container">
        <span className="eyebrow">Radar de lluvia</span>
        <h1 style={{ marginTop: '16px' }}>Tu radar, centrado en tu campo</h1>
        <p style={{ color: 'var(--ink-soft)', margin: '16px auto 32px', maxWidth: '52ch' }}>
          Cada productor registrado tiene su propio radar de lluvia con el pronóstico de precipitación sobre su parcela.
          El enlace te llega por WhatsApp cuando te registrás en el asistente de Iagro.
        </p>
        <a href="/registro" className="btn btn-primary">Registrar mi campo</a>
      </div>
    </section>
  );
}
