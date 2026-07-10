/**
 * Unit tests for the demo identity middleware.
 *
 * Layer: unit.
 * Goal: prove all four resolution branches: absent header (unauthenticated
 * passthrough), unknown user (401 with the valid list, value-free), known
 * user (registry tenant), and the x-tenant-id override.
 * Mocks: a minimal Express request stub exposing `get()`.
 */
import { UnauthorizedException } from '@nestjs/common'
import { describe, expect, it } from '@jest/globals'
import type { NextFunction, Request, Response } from 'express'

import { IdentityMiddleware } from './identity.middleware.js'
import type { AuthenticatedRequest } from './identity.middleware.js'

/** Build a request stub whose `get()` serves the given headers. */
function requestWith(headers: Record<string, string>): AuthenticatedRequest {
  return {
    get: (name: string) => headers[name.toLowerCase()],
  } as unknown as AuthenticatedRequest
}

const middleware = new IdentityMiddleware()
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
