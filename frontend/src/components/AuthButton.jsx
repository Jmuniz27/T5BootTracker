export default function AuthButton({ children, className = '', ...props }) {
  return (
    <button
      className={`w-full py-3.5 rounded-full text-white font-semibold text-sm transition hover:opacity-90 disabled:opacity-60 ${className}`}
      style={{ background: 'linear-gradient(135deg, #2D4DB5 0%, #1a3399 100%)' }}
      {...props}
    >
      {children}
    </button>
  );
}
