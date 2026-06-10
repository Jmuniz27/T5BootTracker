/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#1D3176',
        secondary: '#2563eb',
        'auth-bg': '#1D3176',
      },
    },
  },
  plugins: [],
}
