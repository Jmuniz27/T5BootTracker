# Resumen de Reunión: Daily Sprint 3

**Fecha/Referencia:** Grabación del Daily S3
**Participantes:** Isabella, José Luis, Zahid, Gabriela, Annabella, Juan.

## Puntos Tratados:
- **Avances en Mobile (Isabella):** 
  - Se presentó la vista de leads para el vendedor, con pestañas separadas para "Mis leads" y "Leads disponibles".
  - Filtro y barra de búsqueda implementados en tiempo real.
  - Funcionalidad de *Voice-to-Text* nativa integrada para registrar interacciones, debido a que el módulo de selección de campañas aún no está expuesto en el backend.
  - El estado del lead en la tarjeta (dashboard) no se está actualizando correctamente respecto al último historial registrado, lo cual se debe coordinar con el backend.
- **Avances en Web (Gabriela):**
  - Implementación de la conversión de leads usando validación estricta de cédula.
  - Rediseño del dashboard (nuevos colores para identificar estados de leads).
  - Problemas similares identificados: el historial de interacciones no hace *match* con el estado general mostrado del lead.
- **Acuerdos de UI y UX:**
  - El equipo decidió remover todos los *emojis* de la plataforma por verse poco formales.
  - Se confirmó que tanto la plataforma web como la móvil estarán configuradas completamente en español para uso de los usuarios del bootcamp.
- **Siguientes Pasos:**
  - Estandarizar y actualizar los formularios de creación/edición de interacciones (logs) entre Web y Mobile.
  - Desarrollar la conexión de Calendario/Citas e interacciones en vivo en próximos Sprints.
