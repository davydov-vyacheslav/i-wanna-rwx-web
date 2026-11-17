import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { useHealth } from './useHealth'

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
)

const reply = (body: unknown, status = 200): typeof fetch => () =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

describe('useHealth', () => {
  it('is reachable when the server reports UP', async () => {
    const { result } = renderHook(() => useHealth(reply({ status: 'UP' })), { wrapper })
    await waitFor(() => expect(result.current.reachable).toBe(true))
  })

  it('is not reachable on a 503', async () => {
    const { result } = renderHook(() => useHealth(reply({ status: 'DOWN' }, 503)), { wrapper })
    await waitFor(() => expect(result.current.checking).toBe(false))
    expect(result.current.reachable).toBe(false)
  })

  it('is not reachable when the request fails', async () => {
    const failing: typeof fetch = () => Promise.reject(new TypeError('Failed to fetch'))
    const { result } = renderHook(() => useHealth(failing), { wrapper })
    await waitFor(() => expect(result.current.checking).toBe(false))
    expect(result.current.reachable).toBe(false)
  })
})
