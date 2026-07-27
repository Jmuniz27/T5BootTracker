import * as Linking from 'expo-linking';
import { sanitizePhone, openDialer } from '../phone';

jest.mock('expo-linking', () => ({
  canOpenURL: jest.fn(),
  openURL: jest.fn(),
}));

const mockedCanOpen = Linking.canOpenURL as jest.Mock;
const mockedOpen = Linking.openURL as jest.Mock;

describe('sanitizePhone', () => {
  it('conserva solo los dígitos', () => {
    expect(sanitizePhone('099 123-4567')).toBe('0991234567');
  });

  it('mantiene el + inicial del código de país', () => {
    expect(sanitizePhone('+593 (99) 123 4567')).toBe('+593991234567');
  });

  it('descarta un + que no esté al inicio', () => {
    expect(sanitizePhone('099+123')).toBe('099123');
  });

  it('devuelve null si no hay dígitos', () => {
    expect(sanitizePhone('sin numero')).toBeNull();
    expect(sanitizePhone('')).toBeNull();
    expect(sanitizePhone('   ')).toBeNull();
  });
});

describe('openDialer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedCanOpen.mockResolvedValue(true);
    mockedOpen.mockResolvedValue(undefined);
  });

  it('abre el marcador con el esquema tel: normalizado', async () => {
    const result = await openDialer('099 123-4567');
    expect(result).toBe(true);
    expect(mockedOpen).toHaveBeenCalledWith('tel:0991234567');
  });

  it('devuelve false y no marca si el número es inválido', async () => {
    const result = await openDialer('n/a');
    expect(result).toBe(false);
    expect(mockedOpen).not.toHaveBeenCalled();
  });

  it('devuelve false si el dispositivo no soporta llamadas', async () => {
    mockedCanOpen.mockResolvedValue(false);
    const result = await openDialer('0991234567');
    expect(result).toBe(false);
    expect(mockedOpen).not.toHaveBeenCalled();
  });

  it('devuelve false si openURL lanza un error', async () => {
    mockedOpen.mockRejectedValue(new Error('boom'));
    const result = await openDialer('0991234567');
    expect(result).toBe(false);
  });
});
