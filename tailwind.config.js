/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/catalogue/**/*.{js,ts,jsx,tsx}',
    './components/catalogue/**/*.{js,ts,jsx,tsx}',
    './components/providers/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [
    require('tailwindcss-animate'),
  ],
}
