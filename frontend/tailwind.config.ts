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
          bg: 'rgb(var(--runway-bg) / <alpha-value>)',
          surface: 'rgb(var(--runway-surface) / <alpha-value>)',
          raised: 'rgb(var(--runway-raised) / <alpha-value>)',
          charcoal: 'rgb(var(--runway-charcoal) / <alpha-value>)',
          border: 'rgb(var(--runway-border) / <alpha-value>)',
          borderStrong: 'rgb(var(--runway-borderStrong) / <alpha-value>)',
          text: 'rgb(var(--runway-text) / <alpha-value>)',
          muted: 'rgb(var(--runway-muted) / <alpha-value>)',
          positive: '#34d399', // data-viz accent — constant across themes
          negative: '#fb7185',
          accent: '#6f7cff',
          accent2: '#a78bfa',
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
        soft: 'var(--runway-shadow-soft)',
        raised: 'var(--runway-shadow-raised)',
        glow: 'var(--runway-shadow-glow)',
        'glow-green': 'var(--runway-shadow-glow-green)',
        'glow-red': 'var(--runway-shadow-glow-red)',
        'glow-amber': 'var(--runway-shadow-glow-amber)',
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
        runwayLight: {
          extend: 'light',
          colors: {
            background: '#f4f6fb',
            content1: '#ffffff',
            content2: '#eef1f7',
            content3: '#ffffff',
            divider: '#e2e9f2',
            focus: '#6f7cff',
            default: {
              50: '#ffffff', 100: '#eef1f7', 200: '#e2e9f2', 300: '#cbd5e1',
              400: '#64748b', 500: '#475569', 600: '#334155', 700: '#293548',
              800: '#1a2333', 900: '#0f172a',
              foreground: '#1a2333', DEFAULT: '#e2e9f2',
            },
            primary: { DEFAULT: '#6f7cff', foreground: '#ffffff' },
            secondary: { DEFAULT: '#a78bfa', foreground: '#1a2333' },
            success: { DEFAULT: '#34d399', foreground: '#052e1c' },
            danger: { DEFAULT: '#fb7185', foreground: '#ffffff' },
            warning: { DEFAULT: '#f6b93b', foreground: '#3a2a05' },
          },
        },
      },
    }),
  ],
} satisfies Config;
