/**
 * @fileoverview Ledger module: the read surface over the library's ledger
 * core plus the money-path writes (credits and refunds). The library
 * services resolve from the global dynamic module; the Prisma module backs
 * the host-side credit replay pre-check.
 *
 * @layer ledger
 */
import { Module } from '@nestjs/common'

import { LedgerController } from './ledger.controller.js'
import { LedgerCreditService } from './ledger-credit.service.js'
import { LedgerReadService } from './ledger-read.service.js'
import { PrismaModule } from '../prisma/prisma.module.js'

/** Wires the ledger read and money-path endpoints. */
@Module({
  imports: [PrismaModule],
  controllers: [LedgerController],
  providers: [LedgerCreditService, LedgerReadService],
})
export class LedgerModule {}
