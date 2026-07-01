// Runs synchronously in each page <head> to set the theme before first paint
// (prevents a dark-mode flash). Also exports resolveTheme for unit tests.
(function (root) {
  function resolveTheme(stored, prefersDark) {
    return stored || (prefersDark ? 'dark' : 'light');
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { resolveTheme };
    return;
  }
  var stored = null;
  try {
    stored = localStorage.getItem('theme');
  } catch (e) {
    /* private mode — ignore */
  }
  var prefersDark =
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-theme', resolveTheme(stored, prefersDark));
})(this);
