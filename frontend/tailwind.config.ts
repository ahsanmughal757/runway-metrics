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
          bg: '#0a0c12',        // near-black base — depth without navy murk
          surface: '#10141d',   // lifted surface
          raised: '#171c2a',    // modal / dropdown elevation
          charcoal: '#0d1119',  // inset / subtle panels
          border: '#1b2233',    // barely-there hairline
          borderStrong: '#2b3449',
          text: '#e8ecf5',
          muted: '#8892a8',
          positive: '#34d399',
          negative: '#fb7185',
          accent: '#6f7cff',    // indigo primary
          accent2: '#a78bfa',   // violet secondary
          amber: '#f6b93b',
        },
      },
      fontFamily: {
        condensed: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        display: ['2.5rem', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
        'display-sm': ['1.75rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        micro: ['0.6875rem', { lineHeight: '1', letterSpacing: '0.08em' }],
      },
      spacing: {
        '4.5': '1.125rem',
        '18': '4.5rem',
      },
      backgroundImage: {
        'accent-gradient': 'linear-gradient(135deg, #6f7cff 0%, #a78bfa 100%)',
        'surface-gradient': 'linear-gradient(180deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.01) 100%)',
        'shine': 'linear-gradient(180deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 55%)',
      },
      keyframes: {
        'fade-up': { '0%': { opacity: '0', transform: 'translateY(6px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.35s ease-out both',
        shimmer: 'shimmer 2.2s linear infinite',
        float: 'float 5s ease-in-out infinite',
        'pulse-dot': 'pulse-dot 1.8s ease-in-out infinite',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(0,0,0,0.4), 0 10px 30px -14px rgba(0,0,0,0.55)',
        raised: '0 12px 40px -12px rgba(0,0,0,0.7)',
        glow: '0 0 0 1px rgba(111,124,255,0.22), 0 10px 34px -10px rgba(111,124,255,0.4)',
        'glow-green': '0 0 0 1px rgba(52,211,153,0.25), 0 8px 28px -10px rgba(52,211,153,0.35)',
        'glow-red': '0 0 0 1px rgba(251,113,133,0.25), 0 8px 28px -10px rgba(251,113,133,0.35)',
        'glow-amber': '0 0 0 1px rgba(246,185,59,0.25), 0 8px 28px -10px rgba(246,185,59,0.35)',
        insetSoft: 'inset 0 1px 0 rgba(255,255,255,0.04)',
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
            background: '#0a0c12',
            content1: '#10141d',
            content2: '#0d1119',
            content3: '#171c2a',
            divider: '#1b2233',
            focus: '#6f7cff',
            default: {
              50: '#10141d', 100: '#0d1119', 200: '#1b2233', 300: '#2b3449',
              400: '#4a5470', 500: '#8892a8', 600: '#a7b0c2', 700: '#c9d0dd',
              800: '#e8ecf5', 900: '#f6f8fc',
              foreground: '#e8ecf5', DEFAULT: '#1b2233',
            },
            primary: { DEFAULT: '#6f7cff', foreground: '#ffffff' },
            secondary: { DEFAULT: '#a78bfa', foreground: '#0a0c12' },
            success: { DEFAULT: '#34d399', foreground: '#0a0c12' },
            danger: { DEFAULT: '#fb7185', foreground: '#ffffff' },
            warning: { DEFAULT: '#f6b93b', foreground: '#0a0c12' },
          },
        },
      },
    }),
  ],
} satisfies Config;
