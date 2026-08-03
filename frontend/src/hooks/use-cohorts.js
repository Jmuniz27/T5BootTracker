import { useQuery } from '@tanstack/react-query'
import { getCohorts } from '../api/programs.api'

/**
 * Cohortes de un programa, opcionalmente filtradas por estado.
 *
 * `status` entra en la queryKey para que cada filtro tenga su propia entrada en
 * cache y volver a un filtro ya visto sea inmediato.
 */
export function useCohorts(programId, status = '') {
  return useQuery({
    queryKey: ['cohorts', programId, status],
    queryFn: () => getCohorts(programId, status ? { status } : {}),
    enabled: Boolean(programId),
  })
}
