import { useQuery } from '@tanstack/react-query'

const HEALTH_URL = '/actuator/health'

/** Reachability probe: true when the server answers `UP`, false (query error) otherwise. */
export function useHealth(fetchFn: typeof fetch = (...args) => fetch(...args)) {
  const query = useQuery({
    queryKey: ['health'],
    networkMode: 'always',
    refetchInterval: 30_000,
    retry: false,
    queryFn: async () => {
      const res = await fetchFn(HEALTH_URL, { cache: 'no-store' })
      if (!res.ok) throw new Error(`health ${res.status}`)
      const body = (await res.json()) as { status?: string }
      if (body.status !== 'UP') throw new Error(`health ${body.status}`)
      return true
    },
  })
  return { reachable: query.isSuccess, checking: query.isPending, refetch: query.refetch }
}
