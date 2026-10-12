/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Playfair Display', 'serif'],
        body: ['Inter', 'sans-serif'],
      },
      colors: {
        forest: {
          50: '#f0f9f0',
          100: '#dcf0dc',
          200: '#bbe1bb',
          300: '#8ccb8c',
          400: '#54ab54',
          500: '#2e8b2e',
          600: '#1f6b1f',
          700: '#195819',
          800: '#154615',
          900: '#123a12',
          950: '#0a220a',
        },
        ivory: {
          50: '#fdfdf7',
          100: '#faf9ee',
          200: '#f5f3dc',
          300: '#ece8c4',
          400: '#e0d9a3',
          500: '#d3ca82',
        },
        lime: {
          50: '#f7ffe0',
          100: '#ecffb4',
          200: '#d9ff70',
          300: '#c2f538',
          400: '#a3e018',
          500: '#84c208',
          600: '#629902',
          700: '#4a750a',
        },
      },
    },
  },
  plugins: [],
};
