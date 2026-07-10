/**
 * Unit tests for the root controller.
 *
 * Layer: unit.
 * Goal: prove the JSON hello names the example and the library under test.
 * Mocks: none; the controller has no dependencies.
 */
import { describe, expect, it } from '@jest/globals'

import { AppController } from './app.controller.js'

describe('AppController', () => {
  /**
   * Hello payload contract.
   *
   * The root route is the first thing a reader hits; it must identify the
   * example app and the library it demonstrates.
   */
  it('returns a hello naming the example and the library', () => {
    const controller = new AppController()

    const hello = controller.getHello()

    expect(hello.name).toBe('nest-ai-tokens-example')
    expect(hello.library).toBe('@bymax-one/nest-ai-tokens')
    expect(hello.message.length).toBeGreaterThan(0)
  })
})
