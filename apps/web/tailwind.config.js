/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // Gemini Theme
                'gemini': {
                    bg: '#F0F4F9', // The signature light blue-gray
                    surface: '#FFFFFF',
                    primary: '#0055D4', // Gemini Blue for accents (optional)
                    text: '#1F1F1F',    // Almost black
                    subtext: '#444746', // Dark gray
                    border: '#E3E3E3',
                    hover: '#F2F2F2',
                },
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
                // System font stack tuned for CJK + Latin harmony
                'sans': ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"Helvetica Neue"', '"PingFang SC"', '"Hiragino Sans GB"', '"Noto Sans SC"', 'sans-serif'],
            },
            boxShadow: {
                'gemini-pill': '0 1px 6px rgba(0,0,0,0.12)',
            },
            keyframes: {
                'fade-in': {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                'scale-in': {
                    '0%': { opacity: '0', transform: 'scale(0.95)' },
                    '100%': { opacity: '1', transform: 'scale(1)' },
                },
                'genui-slide-in': {
                    '0%': { opacity: '0', transform: 'translateY(12px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                'genui-card-in': {
                    '0%': { opacity: '0', transform: 'scale(0.92)' },
                    '100%': { opacity: '1', transform: 'scale(1)' },
                },
            },
            animation: {
                'fade-in': 'fade-in 0.2s ease-out',
                'scale-in': 'scale-in 0.2s ease-out',
                'genui-slide-in': 'genui-slide-in 0.4s ease-out both',
                'genui-card-in': 'genui-card-in 0.3s ease-out both',
            }
        },
    },
    plugins: [],
}
