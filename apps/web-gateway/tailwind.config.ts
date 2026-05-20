import type { Config } from 'tailwindcss'

/**
 * Strava-bold light-first design tokens. Mirrors the runtime config that
 * previously lived in head.ejs as a Tailwind Play CDN script. Keep this and
 * src/client/tailwind.css aligned.
 */
const config: Config = {
  content: ['./views/**/*.ejs', './src/client/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#fc4c02',
          50: '#fff5f0',
          100: '#ffe2d2',
          500: '#fc4c02',
          600: '#e64502',
          700: '#cc3d02',
          800: '#a8270c',
          900: '#7a1d09',
        },
        ink: {
          DEFAULT: '#0c0a09',
          muted: '#57534e',
          subtle: '#a8a29e',
        },
        surface: '#fafaf9',
        card: '#ffffff',
        border: '#e7e5e4',
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
        ],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
    },
  },
}

export default config
