import * as Linking from 'expo-linking';

/**
 * Normaliza un teléfono a un formato marcable: conserva solo dígitos y un
 * eventual `+` inicial (código de país). Devuelve `null` si no queda ningún
 * dígito válido para marcar.
 */
export function sanitizePhone(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  return (hasPlus ? '+' : '') + digits;
}

/**
 * Abre el marcador nativo del dispositivo con el número precargado (HST-030).
 * Devuelve `true` si se lanzó el marcador, `false` si el número es inválido o
 * el dispositivo no puede realizar llamadas (tablet, simulador, etc.).
 */
export async function openDialer(rawPhone: string): Promise<boolean> {
  const sanitized = sanitizePhone(rawPhone);
  if (!sanitized) return false;

  const url = `tel:${sanitized}`;
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) return false;
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
