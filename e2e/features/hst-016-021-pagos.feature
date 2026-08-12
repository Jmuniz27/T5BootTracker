# language: es
Característica: HST-016 / HST-021 - Registro y validación de comprobante de pago
  Como bootcamper
  Quiero subir mi comprobante de transferencia
  Para que Finanzas valide mi pago y quede registrado como aprobado

  Escenario: HST-016/021 - Comprobante subido, procesado por OCR y aprobado por Finanzas
    Dado un bootcamper con un comprobante de transferencia
    Cuando lo sube, el sistema lo procesa y Finanzas lo aprueba
    Entonces el pago queda aprobado con el monto confirmado
