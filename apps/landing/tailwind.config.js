/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        air: {
          50: '#F9FAFB',
          100: '#F3F4F6',
          200: '#E5E7EB',
          300: '#D1D5DB',
          400: '#9CA3AF',
          500: '#6B7280',
          900: '#111827',
        },
        night: {
          950: '#111111',
          900: '#0A0A0A',
          800: '#141414',
          700: '#1F1F1F',
          600: '#2A2A2A',
          400: '#6B6B6B',
          300: '#8A8A8A',
          200: '#B0B0B0',
          100: '#E0E0E0',
          50: '#F5F5F5',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"',
          '"Helvetica Neue"', '"PingFang SC"', '"Hiragino Sans GB"',
          '"Noto Sans SC"', 'sans-serif',
        ],
        display: ['"Playfair Display"', 'Georgia', '"Times New Roman"', 'serif'],
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'music-bar': {
          '0%, 100%': { height: '20%' },
          '50%': { height: '100%' },
        },
        'typing-dot': {
          '0%, 100%': { opacity: '0.3', transform: 'translateY(0)' },
          '50%': { opacity: '1', transform: 'translateY(-4px)' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scroll-hint': {
          '0%, 100%': { opacity: '0.3', transform: 'translateY(0)' },
          '50%': { opacity: '0.7', transform: 'translateY(8px)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.6s ease-out both',
        'fade-in-delay-1': 'fade-in 0.6s ease-out 0.1s both',
        'fade-in-delay-2': 'fade-in 0.6s ease-out 0.2s both',
        'fade-in-delay-3': 'fade-in 0.6s ease-out 0.3s both',
        'music-bar-1': 'music-bar 0.8s ease-in-out infinite',
        'music-bar-2': 'music-bar 0.8s ease-in-out infinite 0.2s',
        'music-bar-3': 'music-bar 0.8s ease-in-out infinite 0.4s',
        'typing-dot-1': 'typing-dot 1.4s ease-in-out infinite',
        'typing-dot-2': 'typing-dot 1.4s ease-in-out infinite 0.2s',
        'typing-dot-3': 'typing-dot 1.4s ease-in-out infinite 0.4s',
        'fade-up': 'fade-up 0.6s ease-out both',
        'scroll-hint': 'scroll-hint 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
