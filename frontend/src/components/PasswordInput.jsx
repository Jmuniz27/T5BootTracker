import { forwardRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AuthInput, { LockIcon } from './AuthInput';

const EyeIcon = (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
  </svg>
);

const EyeOffIcon = (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
  </svg>
);

const PasswordInput = forwardRef(function PasswordInput(
  { icon = LockIcon, error, ...props },
  ref
) {
  const { t } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);

  return (
    <AuthInput
      ref={ref}
      icon={icon}
      error={error}
      type={showPassword ? 'text' : 'password'}
      endAdornment={
        <button
          type="button"
          onClick={() => setShowPassword((v) => !v)}
          aria-label={showPassword ? t('common.hidePassword') : t('common.showPassword')}
          // `right-2 p-2` en vez de `right-4`: el área táctil pasa de 20x20 a
          // 36x36 sin mover el ícono (right-2 + p-2 lo deja donde right-4).
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-white/40 hover:text-white/70 transition-colors"
        >
          {showPassword ? EyeOffIcon : EyeIcon}
        </button>
      }
      {...props}
    />
  );
});

export default PasswordInput;
