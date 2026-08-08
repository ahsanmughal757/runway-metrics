import type { Config } from 'tailwindcss';
import { heroui } from '@heroui/theme';

export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    './node_modules/@heroui/theme/dist/**/*.{js,mjs}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        runway: {
          bg: '#0a0e1a',        // deeper navy base than v1 — more contrast against surfaces
          surface: '#131a2c',
          raised: '#182142',    // modal/dropdown elevation, distinct from card surface
          charcoal: '#171f36',
          border: '#242f4d',
          borderStrong: '#334066',
          text: '#eef1f8',
          muted: '#7c88a6',
          positive: '#2fd18f',
          negative: '#f2677a',
          accent: '#5b8cff',
          amber: '#f2b84b',      // 2nd accent — warnings, highlights, comparison series
        },
      },
      fontFamily: {
        condensed: ['"Roboto Condensed"', 'Arial Narrow', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        display: ['2.5rem', { lineHeight: '1.05', letterSpacing: '-0.01em' }],
        'display-sm': ['1.75rem', { lineHeight: '1.1', letterSpacing: '-0.01em' }],
        micro: ['0.6875rem', { lineHeight: '1', letterSpacing: '0.06em' }],
      },
      spacing: {
        '4.5': '1.125rem',
        '18': '4.5rem',
      },
      keyframes: {
        'fade-up': { '0%': { opacity: '0', transform: 'translateY(6px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        'pulse-ring': { '0%': { boxShadow: '0 0 0 0 rgba(91,140,255,0.4)' }, '100%': { boxShadow: '0 0 0 8px rgba(91,140,255,0)' } },
      },
      animation: {
        'fade-up': 'fade-up 0.35s ease-out both',
        'pulse-ring': 'pulse-ring 1.6s ease-out infinite',
      },
      boxShadow: {
        raised: '0 8px 30px -8px rgba(0,0,0,0.55)',
      },
    },
  },
  plugins: [
    heroui({
      defaultTheme: 'runwayDark',
      defaultExtendTheme: 'dark',
      themes: {
        runwayDark: {
          extend: 'dark',
          colors: {
            background: '#0a0e1a',
            content1: '#131a2c',
            content2: '#171f36',
            content3: '#182142',
            divider: '#242f4d',
            focus: '#5b8cff',
            default: {
              50: '#131a2c', 100: '#171f36', 200: '#242f4d', 300: '#334066',
              400: '#5a6690', 500: '#7c88a6', 600: '#9aa4bd', 700: '#c1c8d9',
              800: '#eef1f8', 900: '#f7f9fc',
              foreground: '#eef1f8', DEFAULT: '#242f4d',
            },
            primary: { DEFAULT: '#5b8cff', foreground: '#ffffff' },
            success: { DEFAULT: '#2fd18f', foreground: '#0a0e1a' },
            danger: { DEFAULT: '#f2677a', foreground: '#ffffff' },
            warning: { DEFAULT: '#f2b84b', foreground: '#0a0e1a' },
          },
        },
      },
    }),
  ],
} satisfies Config;
