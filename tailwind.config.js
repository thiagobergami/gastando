/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./public/**/*.html', './public/js/**/*.js'],
  theme: {
    extend: {
      colors: {
        paper: 'rgb(var(--paper) / <alpha-value>)',
        card: 'rgb(var(--card) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        'ink-mut': 'rgb(var(--ink-mut) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        sage: 'rgb(var(--sage) / <alpha-value>)',
        'sage-soft': 'rgb(var(--sage-soft) / <alpha-value>)',
        gold: 'rgb(var(--gold) / <alpha-value>)',
        'gold-accent': 'rgb(var(--gold-accent) / <alpha-value>)',
        clay: 'rgb(var(--clay) / <alpha-value>)',
        'clay-soft': 'rgb(var(--clay-soft) / <alpha-value>)',
        slate: 'rgb(var(--slate) / <alpha-value>)',
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: { lg: '16px', DEFAULT: '8px' },
      boxShadow: { card: '0 4px 20px rgba(143,169,152,0.10)' },
    },
  },
  plugins: [],
};
