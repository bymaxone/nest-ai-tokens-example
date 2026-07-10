/**
 * @fileoverview Unit tests for the identity store: server (no `window`)
 * behavior, localStorage hydration/persistence, subscriber notification,
 * and the header/lookup helpers. Runs under the `node` environment (no
 * jsdom): a hand-rolled `localStorage` stand-in gives full control over
 * both the "no window" and the "window present" branches.
 *
 * @vitest-environment node
 * @layer lib
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const STORAGE_KEY = 'nest-ai-tokens-example:identity'

/** A minimal in-memory `Storage` stand-in (Node has no DOM `localStorage`). */
class MemoryStorage {
  private readonly store = new Map<string, string>()

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }
}

describe('identity-store', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('on the server (no window)', () => {
    // scenario: no window global at all (SSR); reads and writes stay in-memory only.
    it('getIdentity returns null without touching any storage', async () => {
      vi.resetModules()
      const store = await import('./identity-store.js')
      expect(store.getIdentity()).toBeNull()
    })

    // scenario: setIdentity on the server updates the in-process value only.
    it('setIdentity updates the in-memory value without persisting', async () => {
      vi.resetModules()
      const store = await import('./identity-store.js')
      store.setIdentity({ userId: 'ada', tenantId: 'acme' })
      expect(store.getIdentity()).toEqual({ userId: 'ada', tenantId: 'acme' })
    })
  })

  describe('in the browser (window.localStorage present)', () => {
    beforeEach(() => {
      vi.stubGlobal('window', { localStorage: new MemoryStorage() })
    })

    // scenario: a prior session's selection hydrates on first read.
    it('hydrates the persisted identity from localStorage on first read', async () => {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ userId: 'linus', tenantId: 'globex' }),
      )
      vi.resetModules()
      const store = await import('./identity-store.js')
      expect(store.getIdentity()).toEqual({ userId: 'linus', tenantId: 'globex' })
    })

    // scenario: a corrupted (non-JSON) stored value never throws; it degrades to "no identity".
    it('ignores a corrupted (non-JSON) localStorage value', async () => {
      window.localStorage.setItem(STORAGE_KEY, '{not json')
      vi.resetModules()
      const store = await import('./identity-store.js')
      expect(store.getIdentity()).toBeNull()
    })

    // scenario: a value that parses but does not match the Identity shape is rejected too.
    it('ignores a malformed identity shape', async () => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ foo: 1 }))
      vi.resetModules()
      const store = await import('./identity-store.js')
      expect(store.getIdentity()).toBeNull()
    })

    // scenario: a value that parses to JSON but is not an object at all (a primitive) is rejected.
    it('ignores a persisted value that parses to a non-object', async () => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(42))
      vi.resetModules()
      const store = await import('./identity-store.js')
      expect(store.getIdentity()).toBeNull()
    })

    // scenario: a fresh browser with nothing persisted starts with no identity.
    it('returns null when nothing is persisted', async () => {
      vi.resetModules()
      const store = await import('./identity-store.js')
      expect(store.getIdentity()).toBeNull()
    })

    // scenario: selecting an identity persists it and notifies subscribers.
    it('setIdentity persists the selection and notifies subscribers', async () => {
      vi.resetModules()
      const store = await import('./identity-store.js')
      const listener = vi.fn()
      store.subscribe(listener)
      store.setIdentity({ userId: 'root', tenantId: null })
      expect(store.getIdentity()).toEqual({ userId: 'root', tenantId: null })
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe(
        JSON.stringify({ userId: 'root', tenantId: null }),
      )
      expect(listener).toHaveBeenCalledWith({ userId: 'root', tenantId: null })
    })

    // scenario: clearing the selection (null) removes the persisted key.
    it('setIdentity(null) clears the persisted selection', async () => {
      vi.resetModules()
      const store = await import('./identity-store.js')
      store.setIdentity({ userId: 'ada', tenantId: 'acme' })
      store.setIdentity(null)
      expect(store.getIdentity()).toBeNull()
      expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    })

    // scenario: an unsubscribed listener receives no further notifications.
    it('unsubscribe stops further notifications', async () => {
      vi.resetModules()
      const store = await import('./identity-store.js')
      const listener = vi.fn()
      const unsubscribe = store.subscribe(listener)
      unsubscribe()
      store.setIdentity({ userId: 'ada', tenantId: 'acme' })
      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('findDemoUser', () => {
    // scenario: a registered demo id resolves to its full record.
    it('returns the matching demo user', async () => {
      const store = await import('./identity-store.js')
      expect(store.findDemoUser('linus')).toEqual({
        id: 'linus',
        tenantId: 'globex',
        tenantLabel: 'globex',
      })
    })

    // scenario: an id outside the fixed demo registry resolves to undefined.
    it('returns undefined for an unregistered id', async () => {
      const store = await import('./identity-store.js')
      expect(store.findDemoUser('nope')).toBeUndefined()
    })
  })

  describe('identityHeaders', () => {
    // scenario: no selection means no demo headers at all.
    it('returns no headers for a null identity', async () => {
      const store = await import('./identity-store.js')
      expect(store.identityHeaders(null)).toEqual({})
    })

    // scenario: the null-tenant global admin sends only x-demo-user.
    it('returns only x-demo-user for a null-tenant (global admin) identity', async () => {
      const store = await import('./identity-store.js')
      expect(store.identityHeaders({ userId: 'root', tenantId: null })).toEqual({
        'x-demo-user': 'root',
      })
    })

    // scenario: a tenant-scoped identity sends both demo headers.
    it('returns both headers for a tenant-scoped identity', async () => {
      const store = await import('./identity-store.js')
      expect(store.identityHeaders({ userId: 'ada', tenantId: 'acme' })).toEqual({
        'x-demo-user': 'ada',
        'x-tenant-id': 'acme',
      })
    })
  })
})
