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
      },
      fontFamily: {
        sans: [
          '-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"',
          '"Helvetica Neue"', '"PingFang SC"', '"Hiragino Sans GB"',
          '"Noto Sans SC"', 'sans-serif',
        ],
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
      },
      animation: {
        'fade-in': 'fade-in 0.6s ease-out both',
        'fade-in-delay-1': 'fade-in 0.6s ease-out 0.1s both',
        'fade-in-delay-2': 'fade-in 0.6s ease-out 0.2s both',
        'fade-in-delay-3': 'fade-in 0.6s ease-out 0.3s both',
        'music-bar-1': 'music-bar 0.8s ease-in-out infinite',
        'music-bar-2': 'music-bar 0.8s ease-in-out infinite 0.2s',
        'music-bar-3': 'music-bar 0.8s ease-in-out infinite 0.4s',
      },
    },
  },
  plugins: [],
};
