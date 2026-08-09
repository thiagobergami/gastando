// Ícones da barra inferior (Figma `Nav/Bottom`, 21:7): traço fino, `currentColor`,
// para herdarem o sage do estado ativo sem CSS extra.
const ICONS = {
  plus: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  chart:
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M5 20V10M12 20V4M19 20v-6"/></svg>',
  check:
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13l5 5L20 7"/></svg>',
  gear: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/></svg>',
};

// O loop da v0.3 (§3). `Decidir` é a revisão mensal — não uma tela de
// configurações com outro nome. `Configurações` continua alcançável só pela
// engrenagem do cabeçalho.
export const NAV_ITEMS = [
  { href: '/registrar.html', label: 'Registrar', route: '/registrar.html', icon: ICONS.plus },
  { href: '/', label: 'Acompanhar', route: '/', icon: ICONS.chart },
  { href: '/decidir.html', label: 'Decidir', route: '/decidir.html', icon: ICONS.check },
];

const gearLink = (extra) =>
  `<a href="/settings.html" aria-label="Configurações" class="${extra} text-ink-mut hover:text-sage">${ICONS.gear}</a>`;

export function renderNav(active) {
  const topLinks = NAV_ITEMS.map(
    (i) =>
      `<a href="${i.href}" class="px-1 ${i.route === active ? 'text-sage active font-semibold' : 'text-ink-mut'}">${i.label}</a>`,
  ).join('');
  const bottomLinks = NAV_ITEMS.map(
    (i) =>
      `<a href="${i.href}" class="${i.route === active ? 'active' : ''}">${i.icon}<span>${i.label}</span></a>`,
  ).join('');
  return `
    <header class="hidden md:flex items-center max-w-5xl mx-auto px-6 py-5">
      <a href="/" class="font-display text-2xl text-ink">Gastando</a>
      <nav class="ml-auto flex items-center gap-6 text-sm">${topLinks}</nav>
      ${gearLink('ml-6')}
      <div id="nav-actions"></div>
    </header>
    <header class="flex md:hidden items-center px-5 py-4 border-b border-line">
      <a href="/" class="font-display text-xl text-ink">Gastando</a>
      ${gearLink('ml-auto')}
    </header>
    <nav class="bottom-nav">${bottomLinks}</nav>`;
}

export function mountChrome(active) {
  const el = document.getElementById('nav');
  if (el) el.innerHTML = renderNav(active);
}
