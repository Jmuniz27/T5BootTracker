// Etiquetas y colores de los enums de Lead/Interaction.
//
// Viven aquí y no dentro de una pantalla porque los consumen LeadsDashboard y
// la tabla de analítica por vendedor: si cada una guardara su copia, un valor
// nuevo en el backend quedaría traducido en un lado y crudo en el otro.
// Espejo de backend/apps/leads/models.py.

export const SOURCE_LABELS = {
  INSTAGRAM: 'Instagram',
  WHATSAPP: 'WhatsApp',
  LANDING_PAGE: 'Landing Page',
  MANUAL: 'Manual',
}

export const STATUS_LABELS = {
  NEW: 'Nuevo',
  QUALIFIED: 'Calificado',
  INTERESTED: 'Interesado',
  NOT_INTERESTED: 'No interesado',
  CONVERTED: 'Convertido',
}

export const STATUS_COLORS = {
  NEW: 'bg-gray-100 text-gray-500',
  QUALIFIED: 'bg-blue-100 text-blue-700',
  INTERESTED: 'bg-yellow-100 text-yellow-700',
  NOT_INTERESTED: 'bg-red-100 text-red-600',
  CONVERTED: 'bg-green-100 text-green-700',
}

export const INTERACTION_TYPE_LABELS = {
  CALL: 'Llamada',
  WHATSAPP: 'WhatsApp',
  EMAIL: 'Email',
  VISIT: 'Visita',
  NOTE: 'Nota',
}

export const OUTCOME_LABELS = {
  CALL_AGAIN: 'Llamar de nuevo',
  SEND_INFO: 'Enviar información',
  SCHEDULE_VISIT: 'Agendar visita',
  AWAIT_REPLY: 'Esperar respuesta',
  SPEAK_COORDINATOR: 'Hablar coordinador',
  REASSIGNED: 'Reasignado por administrador',
}

export const OUTCOME_COLORS = {
  CALL_AGAIN: 'bg-blue-50 text-blue-600',
  SEND_INFO: 'bg-blue-50 text-blue-600',
  SCHEDULE_VISIT: 'bg-blue-50 text-blue-600',
  AWAIT_REPLY: 'bg-blue-50 text-blue-600',
  SPEAK_COORDINATOR: 'bg-blue-50 text-blue-600',
  REASSIGNED: 'bg-gray-100 text-gray-600',
}

/** Etiqueta legible, o el valor crudo si el backend manda uno que no conocemos. */
export const labelFor = (map, value) => (value ? map[value] ?? value : null)
