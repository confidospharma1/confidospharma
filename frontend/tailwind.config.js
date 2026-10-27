/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Confidos Official Brand Blue (Extracted from authoritative logo)
        brand: {
          50: '#f0f7fd',
          100: '#e0f0fb',
          200: '#bae0f8',
          300: '#80c7f2',
          400: '#3faeec',
          500: '#0082cd', // Primary Brand Blue
          600: '#006eae', // Hover Blue
          700: '#005a8e',
          800: '#004770',
          900: '#003654',
          950: '#001e30',
        },
        // Confidos Official Brand Green (Extracted from logo cross)
        pharmagreen: {
          50: '#f4f9eb',
          100: '#e6f3d1',
          200: '#d0e6a5',
          300: '#b4d772',
          400: '#99c646',
          500: '#80b530', // Primary Brand Green
          600: '#6c9b26', // Hover Green
          700: '#567d1c',
          800: '#436117',
          900: '#334a12',
          950: '#1b2707',
        },
        // Confidos Official Neutral Charcoal (Extracted from "PHARMA" wordmark)
        charcoal: {
          50: '#f6f6f6',
          100: '#e7e7e7',
          200: '#d1d1d1',
          300: '#b0b0b0',
          400: '#888787',
          500: '#6d6c6c',
          600: '#575656',
          700: '#464545',
          800: '#3a3838', // Exact Logo Charcoal
          900: '#222222',
          950: '#121212',
        },
        slate: {
          850: '#151e2e',
          950: '#0b0f17',
        },
      },
    },
  },
  plugins: [],
};
