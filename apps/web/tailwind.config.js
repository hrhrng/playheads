/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    // Dark only — matches iOS. No `dark:` variants used.
    theme: {
        extend: {
            colors: {
                // iOS Playheads palette — driven by CSS vars on :root.
                // Page surface (the painterly mood blob background blends behind this)
                page: 'rgb(var(--page) / <alpha-value>)',
                // Ink scale (text & icons; 4 stops)
                ink: 'rgb(var(--ink) / <alpha-value>)',
                'ink-2': 'rgb(var(--ink) / 0.72)',
                'ink-3': 'rgb(var(--ink) / 0.50)',
                'ink-4': 'rgb(var(--ink) / 0.28)',
                // Hairline + chip surfaces (subtle, ink-derived)
                rule: 'rgb(var(--ink) / 0.16)',
                'rule-strong': 'rgb(var(--ink) / 0.24)',
                chip: 'rgb(var(--ink) / 0.08)',
                'chip-2': 'rgb(var(--ink) / 0.12)',
                'chip-hover': 'rgb(var(--ink) / 0.16)',
                // Mood accents (amber default — c1 bright, c2 warm)
                accent: 'rgb(var(--accent) / <alpha-value>)',
                'accent-2': 'rgb(var(--accent-2) / <alpha-value>)',
                // Legacy gemini aliases kept so any un-migrated className still renders
                // (mapped to closest iOS equivalent so the look stays consistent)
                'gemini': {
                    bg: 'rgb(var(--page) / <alpha-value>)',
                    surface: 'rgb(var(--ink) / 0.06)',
                    primary: 'rgb(var(--accent) / <alpha-value>)',
                    text: 'rgb(var(--ink) / <alpha-value>)',
                    subtext: 'rgb(var(--ink) / 0.72)',
                    border: 'rgb(var(--ink) / 0.16)',
                    hover: 'rgb(var(--ink) / 0.08)',
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
                // Noto Serif SC is the display voice — bilingual CJK + Latin in one face,
                // served by Google Fonts with unicode-range chunking (50 KB Latin + on-demand
                // CJK). System stack remains as immediate fallback so first paint isn't blocked.
                'sans': ['"Noto Serif SC"', '-apple-system', 'BlinkMacSystemFont', '"PingFang SC"', '"Hiragino Sans GB"', '"Noto Sans SC"', 'serif'],
                'display': ['"Noto Serif SC"', '-apple-system', '"PingFang SC"', '"Noto Sans SC"', 'serif'],
                'system': ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"Helvetica Neue"', 'sans-serif'],
            },
            borderRadius: {
                'card': '10px',
                'sheet': '28px',
            },
            boxShadow: {
                // Album cover dual-shadow, matches iOS deep+soft layering
                'cover': '0 20px 50px rgba(0,0,0,0.50), 0 8px 20px rgba(0,0,0,0.35)',
                'glass': '0 1px 0 rgba(255,255,255,0.04) inset, 0 12px 30px rgba(0,0,0,0.25)',
                'pill': '0 1px 6px rgba(0,0,0,0.18)',
                // Kept for back-compat with any lingering className
                'gemini-pill': '0 1px 6px rgba(0,0,0,0.18)',
            },
            backdropBlur: {
                'glass': '24px',
            },
            transitionTimingFunction: {
                'spring': 'cubic-bezier(0.22, 1, 0.36, 1)',
            },
            keyframes: {
                'fade-in': {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                'scale-in': {
                    '0%': { opacity: '0', transform: 'scale(0.96)' },
                    '100%': { opacity: '1', transform: 'scale(1)' },
                },
                'genui-slide-in': {
                    '0%': { opacity: '0', transform: 'translateY(10px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                'genui-card-in': {
                    '0%': { opacity: '0', transform: 'scale(0.94)' },
                    '100%': { opacity: '1', transform: 'scale(1)' },
                },
                'pulse-soft': {
                    '0%, 100%': { opacity: '0.35' },
                    '50%': { opacity: '1' },
                },
            },
            animation: {
                'fade-in': 'fade-in 0.22s ease-out',
                'scale-in': 'scale-in 0.22s cubic-bezier(0.22, 1, 0.36, 1)',
                'genui-slide-in': 'genui-slide-in 0.45s cubic-bezier(0.22, 1, 0.36, 1) both',
                'genui-card-in': 'genui-card-in 0.35s cubic-bezier(0.22, 1, 0.36, 1) both',
                'pulse-soft': 'pulse-soft 1.1s ease-in-out infinite',
            }
        },
    },
    plugins: [],
}
