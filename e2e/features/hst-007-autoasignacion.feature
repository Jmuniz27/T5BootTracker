# language: es
Característica: HST-007 - Auto-asignación de leads
  Como vendedor
  Quiero auto-asignarme un lead disponible
  Para empezar a darle seguimiento sin esperar a que un administrador lo asigne

  Antecedentes:
    Dado un lead disponible y la auto-asignación habilitada

  Escenario: HST-007 - El vendedor se auto-asigna un lead disponible
    Cuando el vendedor pulsa "Asignarme" sobre ese lead
    Entonces el lead queda a su nombre y sale de la lista de disponibles
