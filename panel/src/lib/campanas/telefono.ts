/**
 * Normaliza un teléfono para WhatsApp: solo dígitos, con código de país.
 *   "+591 760-98116" → "59176098116" · "76098116" → "59176098116" (celular boliviano sin código)
 *   "0059176098116" → "59176098116"
 * Devuelve null si no parece un número válido (10 a 15 dígitos).
 */
export function normalizarTelefono(valor: unknown, codigoPais = '591'): string | null {
  let d = String(valor ?? '').replace(/\.0+$/, '').replace(/\D/g, ''); // Excel a veces lo trae como número "76098116.0"
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 8 && /^[67]/.test(d)) d = codigoPais + d;
  return d.length >= 10 && d.length <= 15 ? d : null;
}
