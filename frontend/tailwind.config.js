/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Azul institucional de Coding Bootcamps ESPOL (Figma). Antes convivian
        // dos azules casi identicos (#1D3176 en pagos, #213A8E en el resto);
        // CB-75 unifica en #213A8E.
        primary: '#213A8E',
        'primary-dark': '#1a2f72',
        secondary: '#2563eb',
        'auth-bg': '#213A8E',
      },
      // CB-114: micro-interacciones con CSS puro. El issue pide evaluar
      // framer-motion; para fades, zooms y slides de <=200ms una libreria de
      // ~50 kB no se justifica, y las transiciones nativas corren en el
      // compositor sin re-renders de React.
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'zoom-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(12px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%, 60%': { transform: 'translateX(-4px)' },
          '40%, 80%': { transform: 'translateX(4px)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'fade-in-up': 'fade-in-up 200ms ease-out',
        'zoom-in': 'zoom-in 150ms ease-out',
        'slide-in-right': 'slide-in-right 200ms ease-out',
        shimmer: 'shimmer 1.6s infinite',
        shake: 'shake 300ms ease-in-out',
      },
    },
  },
  plugins: [],
}
