# language: es
Característica: HST-013 - Conversión de lead a bootcamper con validación de cédula
  Como vendedor
  Quiero convertir un lead calificado en bootcamper validando su cédula ecuatoriana
  Para formalizar su inscripción en el programa

  Escenario: HST-013 - Cédula inválida rechazada y conversión completada con una válida
    Dado un lead calificado asignado al vendedor
    Cuando lo convierte a bootcamper indicando una cédula ecuatoriana válida
    Entonces el sistema rechaza la cédula inválida y completa la conversión con la válida

  Escenario: HST-013 - Reenvío de la invitación de un bootcamper sin activar
    Dado un lead recién convertido cuyo bootcamper sigue sin activar la cuenta
    Cuando el vendedor reenvía la invitación
    Entonces recibe un link nuevo para compartir
