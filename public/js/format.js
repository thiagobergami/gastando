export function formatBRL(cents) {
  const neg = cents < 0;
  const v = Math.abs(Math.trunc(cents));
  const reais = Math.floor(v / 100).toLocaleString('pt-BR');
  const c = String(v % 100).padStart(2, '0');
  return `${neg ? '-' : ''}R$ ${reais},${c}`;
}
export function reaisToCents(reais) { return Math.round(Number(reais) * 100); }
export function currentMonth() { return new Date().toISOString().slice(0, 7); }
