import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'darker-navy': '#0a0c10',
        'dark-navy': '#0f1419',
        'deep-blue': '#1a1f2e',
        'physical': '#00d4ff',
        'emotional': '#ec4899',
        'intellectual': '#a855f7',
        'destructive': '#ef4444',
      },
      fontFamily: {
        heading: ['var(--font-cinzel)', 'Cinzel', 'serif'],
        body: ['var(--font-cormorant)', 'Cormorant', 'Georgia', 'serif'],
        mono: ['var(--font-orbitron)', 'Orbitron', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '0',
        none: '0',
        sm: '0.125rem',
        md: '0.375rem',
        lg: '0.5rem',
        xl: '0.75rem',
        full: '9999px',
      },
      boxShadow: {
        glow: '0 0 8px rgba(255, 255, 255, 0.15)',
        'glow-hover': '0 0 12px rgba(255, 255, 255, 0.25)',
        'glow-text': '0 0 15px rgba(255, 255, 255, 0.3)',
        'card': '0 0 15px rgba(255, 255, 255, 0.1)',
      },
    },
  },
  plugins: [],
}

export default config
