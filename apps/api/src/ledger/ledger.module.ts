/**
 * @fileoverview Ledger module: the read surface over the library's ledger
 * core (`LedgerService` resolves from the global dynamic module, so no
 * imports are needed here).
 *
 * @layer ledger
 */
import { Module } from '@nestjs/common'

import { LedgerController } from './ledger.controller.js'
import { LedgerReadService } from './ledger-read.service.js'

/** Wires the ledger read endpoints. */
@Module({
  controllers: [LedgerController],
  providers: [LedgerReadService],
})
export class LedgerModule {}
