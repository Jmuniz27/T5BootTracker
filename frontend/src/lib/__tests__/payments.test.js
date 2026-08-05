import { flattenUploadError } from '../payments';

describe('flattenUploadError', () => {
  it('usa el mensaje de error del backend cuando viene en formato propio', () => {
    const error = { response: { data: { error: 'Comprobante duplicado.' } } };
    expect(flattenUploadError(error)).toBe('Comprobante duplicado.');
  });

  it('aplana errores de validación DRF a texto legible', () => {
    const error = {
      response: {
        data: {
          receipt_file: ['El archivo no puede superar 10 MB.'],
          program_id: ['Programa no encontrado.'],
        },
      },
    };
    expect(flattenUploadError(error)).toBe(
      'El archivo no puede superar 10 MB. Programa no encontrado.',
    );
  });

  it('devuelve el mensaje genérico si no hay respuesta', () => {
    expect(flattenUploadError({})).toBe('Error al subir el comprobante.');
  });

  it('devuelve el mensaje genérico si la respuesta no tiene forma reconocible', () => {
    const error = { response: { data: {} } };
    expect(flattenUploadError(error)).toBe('Error al subir el comprobante.');
  });
});
