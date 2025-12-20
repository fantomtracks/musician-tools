import type { Config } from 'tailwindcss'

export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f5f7ff',
          100: '#e9eeff',
          200: '#c7d2ff',
          300: '#a3b6ff',
          400: '#7a93ff',
          500: '#4f6cff',
          600: '#3a52cc',
          700: '#2c3ea3',
          800: '#1f2a73',
          900: '#121845',
        },
      },
    },
  },
  plugins: [],
} satisfies Config
