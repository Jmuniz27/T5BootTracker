# language: es
Característica: HST-032 / HST-009 - Creación manual de lead y registro de interacción
  Como vendedor
  Quiero crear un lead manualmente y registrar una interacción sobre él
  Para capturar prospectos que no llegaron por un canal automatizado

  Escenario: HST-032/009 - Alta manual de lead y registro de la primera interacción
    Dado un vendedor en el dashboard de leads
    Cuando crea un lead manualmente y registra una interacción sobre él
    Entonces el lead aparece asignado a él con la interacción registrada
