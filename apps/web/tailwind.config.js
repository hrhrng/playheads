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
            },
            fontFamily: {
                // Gemini uses Google Sans, we'll map closest
                'sans': ['"Google Sans"', 'Inter', '-apple-system', 'sans-serif'],
            },
            boxShadow: {
                'gemini-pill': '0 1px 6px rgba(0,0,0,0.12)',
            }
        },
    },
    plugins: [],
}
