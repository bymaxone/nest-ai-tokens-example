/**
 * @fileoverview Pricing module: runs the idempotent boot seed for the price
 * registry (library snapshot plus mock models) and hosts the pricing REST
 * surface.
 *
 * @layer pricing
 */
import { Module } from '@nestjs/common'

import { PricingCatalogService } from './pricing-catalog.service.js'
import { PricingController } from './pricing.controller.js'
import { PricingSeedService } from './pricing-seed.service.js'
import { PrismaModule } from '../prisma/prisma.module.js'

/** Wires the pricing boot seed and the pricing endpoints. */
@Module({
  imports: [PrismaModule],
  controllers: [PricingController],
  providers: [PricingSeedService, PricingCatalogService],
})
export class PricingModule {}
