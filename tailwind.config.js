/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/catalogue/**/*.{js,ts,jsx,tsx}',
    './app/onramp/**/*.{js,ts,jsx,tsx}',
    './components/catalogue/**/*.{js,ts,jsx,tsx}',
    './components/onramp/**/*.{js,ts,jsx,tsx}',
    './components/ui/**/*.{js,ts,jsx,tsx}',
    './components/providers/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        serif: ['var(--font-serif)', 'ui-serif', 'Georgia', 'serif'],
      },
      colors: {
        // Landing-aligned editorial palette.
        // canvas/ink/line are constant across themes, so they use <alpha-value>
        // to support Tailwind opacity modifiers (bg-canvas/50, etc).
        // ember is the user-selectable accent and reads from --cat-accent so
        // the ember/cyan/lime/magenta theme from the landing propagates here.
        canvas: {
          DEFAULT: 'oklch(0.14 0.008 260 / <alpha-value>)',
          soft:    'oklch(0.17 0.009 260 / <alpha-value>)',
          lift:    'oklch(0.21 0.01 260 / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'oklch(0.96 0.006 80 / <alpha-value>)',
          dim:     'oklch(0.7 0.01 80 / <alpha-value>)',
          mute:    'oklch(0.48 0.01 260 / <alpha-value>)',
        },
        line: {
          DEFAULT: 'oklch(0.22 0.01 260 / <alpha-value>)',
          strong:  'oklch(0.28 0.012 260 / <alpha-value>)',
        },
        ember: {
          DEFAULT: 'var(--cat-accent, oklch(0.74 0.18 50))',
          soft:    'var(--cat-accent-soft, oklch(0.74 0.18 50 / 0.15))',
          ink:     'var(--cat-accent-ink, oklch(0.22 0.06 50))',
        },
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'),
  ],
}
