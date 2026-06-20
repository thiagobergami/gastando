export const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', route: '/' },
  { href: '/transactions.html', label: 'Transactions', route: '/transactions.html' },
  { href: '/settings.html', label: 'Settings', route: '/settings.html' },
  { href: '/bi.html', label: 'BI', route: '/bi.html' },
  { href: '/simulate.html', label: 'Simulate', route: '/simulate.html' },
];

export function renderNav(active) {
  const topLinks = NAV_ITEMS.map(i =>
    `<a href="${i.href}" class="px-1 ${i.route === active ? 'text-sage active font-semibold' : 'text-ink-mut'}">${i.label}</a>`
  ).join('');
  const bottomLinks = NAV_ITEMS.map(i =>
    `<a href="${i.href}" class="${i.route === active ? 'active' : ''}">${i.label}</a>`
  ).join('');
  return `
    <header class="hidden md:flex items-center gap-6 max-w-5xl mx-auto px-6 py-5">
      <a href="/" class="font-display text-2xl text-ink">Gastando</a>
      <nav class="flex items-center gap-5 text-sm">${topLinks}</nav>
      <div id="nav-actions" class="ml-auto"></div>
    </header>
    <nav class="bottom-nav">${bottomLinks}</nav>`;
}

// First-run guard: send the user to the setup wizard until onboarding is done.
// Tolerant of failures — a flaky check must never lock the user out of the app.
export async function enforceOnboarding(fetchFn, loc) {
  if (loc.pathname === '/setup.html') return;
  try {
    const res = await fetchFn('/api/onboarding');
    if (!res.ok) return;
    const { complete } = await res.json();
    if (!complete) loc.replace('/setup.html');
  } catch {
    /* offline or API error — let the app load normally */
  }
}

export function mountChrome(active) {
  const el = document.getElementById('nav');
  if (el) el.innerHTML = renderNav(active);
  if (typeof fetch !== 'undefined' && typeof location !== 'undefined') {
    enforceOnboarding(fetch, location);
  }
}
