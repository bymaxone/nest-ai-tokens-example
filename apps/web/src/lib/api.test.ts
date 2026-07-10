/**
 * @fileoverview Unit test for the shared api singleton: its header provider
 * must forward the identity store's current selection on every request.
 *
 * @layer lib
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from './api.js'
import { setIdentity } from './identity-store.js'

describe('api singleton', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ status: 'up' })),
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    setIdentity(null)
  })

  // scenario: no identity selected sends no demo headers.
  it('sends no demo headers when no identity is selected', async () => {
    setIdentity(null)
    await api.getLiveness()
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.headers).toEqual({ accept: 'application/json' })
  })

  // scenario: the store's current selection travels as the demo headers.
  it('forwards the identity store selection as demo headers', async () => {
    setIdentity({ userId: 'grace', tenantId: 'acme' })
    await api.getLiveness()
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.headers).toMatchObject({ 'x-demo-user': 'grace', 'x-tenant-id': 'acme' })
  })
})
