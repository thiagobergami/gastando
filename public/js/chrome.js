export const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', route: '/' },
  { href: '/registrar.html', label: 'Transações', route: '/registrar.html' },
  { href: '/parcelas.html', label: 'Parcelas', route: '/parcelas.html' },
  { href: '/recurring.html', label: 'Recorrentes', route: '/recurring.html' },
  { href: '/settings.html', label: 'Configurações', route: '/settings.html' },
  { href: '/analise.html', label: 'BI', route: '/analise.html' },
  { href: '/simulate.html', label: 'Simular', route: '/simulate.html' },
];

export function renderNav(active) {
  const topLinks = NAV_ITEMS.map(
    (i) =>
      `<a href="${i.href}" class="px-1 ${i.route === active ? 'text-sage active font-semibold' : 'text-ink-mut'}">${i.label}</a>`,
  ).join('');
  const bottomLinks = NAV_ITEMS.map(
    (i) => `<a href="${i.href}" class="${i.route === active ? 'active' : ''}">${i.label}</a>`,
  ).join('');
  return `
    <header class="hidden md:flex items-center gap-6 max-w-5xl mx-auto px-6 py-5">
      <a href="/" class="font-display text-2xl text-ink">Gastando</a>
      <nav class="flex items-center gap-5 text-sm">${topLinks}</nav>
      <div class="ml-auto flex items-center gap-3">
        <button id="theme-toggle" type="button" aria-label="Alternar tema"
          class="text-ink-mut hover:text-sage text-lg leading-none">◐</button>
        <div id="nav-actions"></div>
      </div>
    </header>
    <nav class="bottom-nav">${bottomLinks}</nav>`;
}

export function mountChrome(active) {
  const el = document.getElementById('nav');
  if (el) el.innerHTML = renderNav(active);
  const toggle = document.getElementById('theme-toggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try {
        localStorage.setItem('theme', next);
      } catch {
        /* ignore */
      }
      window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: next } }));
    });
  }
}
