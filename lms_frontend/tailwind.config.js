/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          bg: '#0a192f',
          dark: '#020c1b',
          light: '#112240',
        }
      }
    },
  },
  plugins: [],
}
