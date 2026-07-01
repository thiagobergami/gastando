// Runs synchronously in each page <head> to set the theme before first paint
// (prevents a dark-mode flash). Also exports resolveTheme for unit tests.
function resolveTheme(stored, prefersDark) {
  return stored || (prefersDark ? 'dark' : 'light');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { resolveTheme };
} else {
  let stored = null;
  try {
    stored = localStorage.getItem('theme');
  } catch {
    /* private mode — ignore */
  }
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-theme', resolveTheme(stored, prefersDark));
}
