/**
 * Unit tests for the demo identity middleware.
 *
 * Layer: unit.
 * Goal: prove all resolution branches: absent header (unauthenticated
 * passthrough), unknown user (401 with the valid list, value-free), known
 * user (registry tenant), the x-tenant-id override, and the strict-mode
 * `tenant.required` 403 for null-tenant identities.
 * Mocks: a minimal Express request stub exposing `get()`; a typed env
 * fixture (the middleware reads only TENANT_REQUIRED).
 */
import { UnauthorizedException } from '@nestjs/common'
import { describe, expect, it } from '@jest/globals'
import type { NextFunction, Request, Response } from 'express'

import { IdentityMiddleware } from './identity.middleware.js'
import type { AuthenticatedRequest } from './identity.middleware.js'
import { TENANT_REQUIRED_ERROR_CODE } from './tenant-policy.js'
import { ApiException } from '../common/api-exception.js'
import type { EnvConfig } from '../config/env.js'

/** Build a request stub whose `get()` serves the given headers. */
function requestWith(headers: Record<string, string>): AuthenticatedRequest {
  return {
    get: (name: string) => headers[name.toLowerCase()],
  } as unknown as AuthenticatedRequest
}

/** A complete typed env fixture with overridable fields. */
function envWith(overrides: Partial<EnvConfig> = {}): EnvConfig {
  return {
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/ai_tokens_example',
    PORT: 3001,
    AI_PROVIDER_MODE: 'mock',
    QUOTA_ENABLED: true,
    QUOTA_TOLERANCE: 1.2,
    QUOTA_MINIMUM_BALANCE: 0,
    TENANT_REQUIRED: false,
    PRICING_CACHE_TTL_MS: 300_000,
    MOCK_LATENCY_MS: 0,
    ...overrides,
  }
}

const middleware = new IdentityMiddleware(envWith())
const response = {} as Response

/** Typed manual spy for Express's overloaded NextFunction. */
function makeNext(): { next: NextFunction; calls: () => number } {
  let count = 0
  const next: NextFunction = () => {
    count += 1
  }
  return { next, calls: () => count }
}

describe('IdentityMiddleware', () => {
  /**
   * Absent header branch.
   *
   * Without x-demo-user the request proceeds unauthenticated and untouched,
   * keeping the guard's missing-user path reachable.
   */
  it('passes the request through untouched when no x-demo-user is sent', () => {
    const req = requestWith({})
    const { next, calls } = makeNext()

    middleware.use(req, response, next)

    expect(calls()).toBe(1)
    expect(req.user).toBeUndefined()
  })

  /**
   * Unknown-user branch (value-free 401).
   *
   * An unregistered id must be rejected with the valid demo users listed and
   * the received value never echoed back.
   */
  it('throws a 401 listing valid users for an unknown x-demo-user', () => {
    const req = requestWith({ 'x-demo-user': 'mallory-SECRET' })
    const { next, calls } = makeNext()
    expect.assertions(4)

    try {
      middleware.use(req, response, next)
    } catch (error) {
      expect(error).toBeInstanceOf(UnauthorizedException)
      const body = (error as UnauthorizedException).getResponse() as {
        message: string
        validUsers: string[]
      }
      expect(body.validUsers).toEqual(['ada', 'grace', 'linus', 'root'])
      expect(JSON.stringify(body)).not.toContain('mallory-SECRET')
    }
    expect(calls()).toBe(0)
  })

  /**
   * Known-user branch with registry default tenant.
   *
   * A registered user without a tenant override gets the registry tenant.
   */
  it('attaches req.user with the registry tenant for a known user', () => {
    const req = requestWith({ 'x-demo-user': 'ada' })
    const { next, calls } = makeNext()

    middleware.use(req, response, next)

    expect(req.user).toEqual({ id: 'ada', tenantId: 'acme' })
    expect(calls()).toBe(1)
  })

  /**
   * Tenant override branch.
   *
   * x-tenant-id overrides the registry default, powering the tenant
   * isolation demos.
   */
  it('lets x-tenant-id override the registry tenant', () => {
    const req = requestWith({ 'x-demo-user': 'ada', 'x-tenant-id': 'globex' })
    const { next } = makeNext()

    middleware.use(req, response, next)

    expect(req.user).toEqual({ id: 'ada', tenantId: 'globex' })
  })

  /**
   * Blank override falls back to the registry tenant.
   *
   * An empty or whitespace-only x-tenant-id counts as absent: it must not
   * mint an empty-string tenant (which would dodge the strict-tenancy
   * null check) and the registry default applies instead.
   */
  it.each([[''], ['   ']])('treats a blank x-tenant-id (%j) as absent', (blank) => {
    const req = requestWith({ 'x-demo-user': 'ada', 'x-tenant-id': blank })
    const { next } = makeNext()

    middleware.use(req, response, next)

    expect(req.user).toEqual({ id: 'ada', tenantId: 'acme' })
  })

  /**
   * Null-tenant admin.
   *
   * The global admin resolves with a null tenant, exercising the identity
   * shape the multi-tenant demos rely on.
   */
  it('resolves the global admin with a null tenant', () => {
    const req = requestWith({ 'x-demo-user': 'root' })
    const { next } = makeNext()

    middleware.use(req, response, next)

    expect(req.user).toEqual({ id: 'root', tenantId: null })
  })
})

describe('IdentityMiddleware with TENANT_REQUIRED=true', () => {
  const strict = new IdentityMiddleware(envWith({ TENANT_REQUIRED: true }))

  /**
   * Strict-mode rejection at the choke point.
   *
   * A null-tenant identity must be rejected with the canonical 403
   * `tenant.required` envelope BEFORE `req.user` is attached, so no
   * downstream layer can fall back to the global tenant.
   */
  it('throws the canonical tenant.required 403 for a null-tenant identity', () => {
    const req = requestWith({ 'x-demo-user': 'root' })
    const { next, calls } = makeNext()
    expect.assertions(5)

    try {
      strict.use(req, response, next)
    } catch (error) {
      expect(error).toBeInstanceOf(ApiException)
      expect((error as ApiException).code).toBe(TENANT_REQUIRED_ERROR_CODE)
      expect((error as ApiException).getStatus()).toBe(403)
    }
    expect(req.user).toBeUndefined()
    expect(calls()).toBe(0)
  })

  /**
   * Strict-mode acceptance for tenant-scoped identities.
   *
   * Tenant-carrying users are unaffected by the strict mode, including the
   * admin adopting a tenant through the x-tenant-id override.
   */
  it('accepts tenant-scoped identities, including an x-tenant-id override', () => {
    const ada = requestWith({ 'x-demo-user': 'ada' })
    const rootWithTenant = requestWith({ 'x-demo-user': 'root', 'x-tenant-id': 'acme' })
    const { next, calls } = makeNext()

    strict.use(ada, response, next)
    strict.use(rootWithTenant, response, next)

    expect(ada.user).toEqual({ id: 'ada', tenantId: 'acme' })
    expect(rootWithTenant.user).toEqual({ id: 'root', tenantId: 'acme' })
    expect(calls()).toBe(2)
  })
})

describe('IdentityMiddleware under Nest typing', () => {
  /**
   * Express Request compatibility.
   *
   * The middleware signature accepts a plain Express Request; this test only
   * pins the compile-time contract (a Request assigns to the parameter).
   */
  it('accepts a plain Express request type', () => {
    const use: (req: Request, res: Response, next: NextFunction) => void =
      middleware.use.bind(middleware)

    expect(typeof use).toBe('function')
  })
})
