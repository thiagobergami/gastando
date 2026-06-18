/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./public/**/*.html', './public/js/**/*.js'],
  theme: {
    extend: {
      colors: {
        paper: '#fbf9f4',
        card: '#ffffff',
        ink: '#1b1c19',
        'ink-mut': '#424844',
        line: '#e4e2dd',
        sage: '#4c6455',
        'sage-soft': '#8fa998',
        gold: '#735c00',
        'gold-accent': '#d4af37',
        clay: '#8a4f35',
        'clay-soft': '#c27d60',
        slate: '#5c7c84',
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
