export function formatBRL(cents) {
  const neg = cents < 0;
  const v = Math.abs(Math.trunc(cents));
  const reais = Math.floor(v / 100).toLocaleString('pt-BR');
  const c = String(v % 100).padStart(2, '0');
  return `${neg ? '-' : ''}R$ ${reais},${c}`;
}
export function reaisToCents(reais) {
  return Math.round(Number(reais) * 100);
}
export function centsToReais(cents) {
  return (cents / 100).toFixed(2);
}
export function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}
export function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}
// A linha rápida usa `type="text"`, não `type="number"`: o campo mostra
// `R$ 248,90` em mono, como no Figma, e a pessoa digita com vírgula. Aceitar só
// `Number()` transformaria o caso comum brasileiro em NaN.
export function parseReais(input) {
  if (input === null || input === undefined) return Number.NaN;
  if (typeof input === 'number') return Math.round(input * 100);
  const cleaned = String(input)
    .replace(/[R$\s]/g, '')
    .replace(/\.(?=\d{3}\b)/g, '') // separador de milhar
    .replace(',', '.');
  if (cleaned === '' || !/^-?\d*\.?\d+$/.test(cleaned)) return Number.NaN;
  return Math.round(Number(cleaned) * 100);
}

const MONTHS_SHORT = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

// `'2026-08-06' → '06/08'`, como as linhas da lista no Figma (6:32).
export function shortDate(iso) {
  const [, m, d] = String(iso ?? '').split('-');
  return m && d ? `${d}/${m}` : '';
}

// `'2027-03' → 'mar/2027'`, para o "até <mês>" dos compromissos.
export function monthShort(ym) {
  const [y, m] = String(ym ?? '').split('-');
  const name = MONTHS_SHORT[Number(m) - 1];
  return name ? `${name}/${y}` : '';
}

// O sinal aritmético do §Global Constraints é U+2212, não hífen: `− R$ 142,00`
// alinha com `+ R$ 268,00` em fonte mono, e o hífen não alinha. Mora aqui para
// que `pauta.js` e `review.js` não tenham cada um a sua cópia.
export const MINUS = '−';

// Os nomes de mês nascem em minúsculo, porque o mesmo nome aparece no meio de
// frase e no começo dela. Quem precisa de caixa alta capitaliza na borda.
export function capitalize(s) {
  return String(s ?? '').replace(/^./, (c) => c.toUpperCase());
}

const MONTHS_LONG = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

// `'2026-08' → 'agosto'`. Minúsculo: quem precisa de caixa alta capitaliza na
// borda, porque o mesmo nome aparece no meio de frase e no começo dela.
export function monthName(ym) {
  const [, m] = String(ym ?? '').split('-');
  return MONTHS_LONG[Number(m) - 1] ?? '';
}

export function esc(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}
