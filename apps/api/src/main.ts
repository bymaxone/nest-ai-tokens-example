/**
 * @fileoverview Process entry point. Delegates entirely to the tested
 * `bootstrap()` seam; nothing imports this file, so importing the application
 * (tests, e2e harness) never opens a port. Excluded from coverage for the
 * same reason `prisma/seed.ts` is: it only wires the entry.
 *
 * @layer bootstrap
 */
import { bootstrap } from './bootstrap.js'

try {
  await bootstrap()
} catch {
  // bootstrap() already reported the failure and set the process exit code.
}
