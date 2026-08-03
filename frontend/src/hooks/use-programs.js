import { useQuery } from '@tanstack/react-query'
import { getPrograms } from '../api/programs.api'

// Lista de programas con su conteo de cohortes (lo anota el backend).
export function usePrograms() {
  return useQuery({
    queryKey: ['programs'],
    queryFn: getPrograms,
  })
}
