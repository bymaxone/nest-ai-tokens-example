/**
 * Unit tests for the library constructor-metadata shim.
 *
 * Layer: unit.
 * Goal: prove the shim defines exactly the paramtypes Nest needs for the
 * library's one class-registered provider, and that it never overwrites an
 * existing definition (idempotence / forward compatibility).
 * Mocks: none; the shim operates on the real imported class.
 */
import 'reflect-metadata'
import { MeteringInterceptor, MeteringService } from '@bymax-one/nest-ai-tokens'
import { Reflector } from '@nestjs/core'
import { describe, expect, it } from '@jest/globals'

import { applyLibraryParamtypesShim } from './library-metadata.shim.js'

describe('applyLibraryParamtypesShim', () => {
  /**
   * Metadata definition.
   *
   * The published bundle ships no design:paramtypes; after the shim, Nest
   * must see [Reflector, MeteringService, Object] on MeteringInterceptor
   * (the third slot is overridden by the class's own @Inject decorator).
   */
  it('defines the interceptor constructor paramtypes', () => {
    applyLibraryParamtypesShim()

    const paramtypes: unknown = Reflect.getMetadata('design:paramtypes', MeteringInterceptor)

    expect(paramtypes).toEqual([Reflector, MeteringService, Object])
  })

  /**
   * Idempotence / forward compatibility.
   *
   * A second call (or a future library build that ships its own metadata)
   * must leave the existing definition untouched.
   */
  it('does not overwrite an existing definition', () => {
    applyLibraryParamtypesShim()
    const first: unknown = Reflect.getMetadata('design:paramtypes', MeteringInterceptor)

    applyLibraryParamtypesShim()
    const second: unknown = Reflect.getMetadata('design:paramtypes', MeteringInterceptor)

    expect(second).toBe(first)
  })
})
