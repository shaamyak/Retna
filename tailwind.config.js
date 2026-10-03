/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#eef5ff',
          100: '#d9e9ff',
          200: '#bcd6ff',
          300: '#8ebcff',
          400: '#5896f8',
          500: '#3370f0',
          600: '#1d4fe5',
          700: '#163bcc',
          800: '#1832a5',
          900: '#192e82',
          950: '#141e50',
        },
        slate: {
          850: '#1a2234',
          900: '#0f172a',
          950: '#060c1a',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-mesh': 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
      },
    },
  },
  plugins: [],
}
