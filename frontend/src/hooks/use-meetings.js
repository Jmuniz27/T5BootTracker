import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getMeetings, createMeeting, updateMeeting, deleteMeeting } from '../api/meetings.api'

export function useMeetings(params = {}) {
  return useQuery({
    queryKey: ['meetings', params],
    queryFn: () => getMeetings(params),
  })
}

export function useMeetingMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['meetings'] })

  const create = useMutation({ mutationFn: createMeeting, onSuccess: invalidate })
  const update = useMutation({
    mutationFn: ({ id, data }) => updateMeeting(id, data),
    onSuccess: invalidate,
  })
  const remove = useMutation({ mutationFn: deleteMeeting, onSuccess: invalidate })

  return { create, update, remove }
}
