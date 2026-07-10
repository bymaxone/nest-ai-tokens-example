/**
 * @fileoverview Root controller: a JSON hello identifying the example and
 * pointing at the interesting entry points.
 *
 * @layer controller
 */
import { Controller, Get } from '@nestjs/common'

/** The root hello payload. */
export interface AppHello {
  /** The example application's name. */
  readonly name: string
  /** The library this application demonstrates. */
  readonly library: string
  /** One-line description of what the API shows. */
  readonly message: string
}

/** Serves `GET /`. */
@Controller()
export class AppController {
  /**
   * Identify the example.
   *
   * @returns The hello payload naming the example and the library under test.
   */
  @Get()
  getHello(): AppHello {
    return {
      name: 'nest-ai-tokens-example',
      library: '@bymax-one/nest-ai-tokens',
      message:
        'Reference API demonstrating AI token metering, effective-dated pricing, wallets, and budgets.',
    }
  }
}
