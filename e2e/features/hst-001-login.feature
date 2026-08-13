# language: es
Característica: HST-001 - Inicio de sesión
  Como vendedor registrado en el sistema
  Quiero iniciar sesión con mis credenciales
  Para acceder al panel de gestión de leads

  Antecedentes:
    Dado que el vendedor está en la pantalla de inicio de sesión

  Escenario: HST-001 - Inicio de sesión exitoso
    Cuando ingresa su email y contraseña correctos
    Entonces accede al panel y ve su sesión iniciada

  Escenario: HST-001 - Contraseña incorrecta
    Cuando ingresa una contraseña incorrecta
    Entonces el sistema rechaza el acceso y no inicia sesión
