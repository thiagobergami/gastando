export function formatBRL(cents) {
  const neg = cents < 0;
  const v = Math.abs(Math.trunc(cents));
  const reais = Math.floor(v / 100).toLocaleString('pt-BR');
  const c = String(v % 100).padStart(2, '0');
  return `${neg ? '-' : ''}R$ ${reais},${c}`;
}
export function reaisToCents(reais) { return Math.round(Number(reais) * 100); }
export function centsToReais(cents) { return (cents / 100).toFixed(2); }
export function currentMonth() { return new Date().toISOString().slice(0, 7); }
export function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}
export function esc(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
