/**
 * @fileoverview Host-side constructor-metadata shim for the published
 * library bundle. The `@bymax-one/nest-ai-tokens` dist is compiled with
 * esbuild, which cannot emit `design:paramtypes`; every library provider is
 * registered through an explicit `useFactory` except `MeteringInterceptor`,
 * whose first two constructor parameters (Reflector, MeteringService) carry
 * no `@Inject` decorator. Without this shim, `forRoot`/`forRootAsync` fails
 * at boot with "Nest can't resolve dependencies of the MeteringInterceptor".
 * The shim supplies exactly the metadata `emitDecoratorMetadata` would have
 * produced; it touches nothing else and is idempotent.
 *
 * @layer ai
 */
import 'reflect-metadata'
import { MeteringInterceptor, MeteringService } from '@bymax-one/nest-ai-tokens'
import { Reflector } from '@nestjs/core'

/** The reflect-metadata key NestJS reads for constructor parameter types. */
const PARAMTYPES_KEY = 'design:paramtypes'

/**
 * Define `design:paramtypes` for the library's one class-registered provider
 * so Nest can resolve its constructor. The third parameter is typed `Object`
 * because its explicit `@Inject(BYMAX_AI_TOKENS_OPTIONS)` takes precedence.
 * Idempotent: a subsequent call (or a future library build that ships its
 * own metadata) leaves the existing definition untouched.
 */
export function applyLibraryParamtypesShim(): void {
  const existing: unknown = Reflect.getMetadata(PARAMTYPES_KEY, MeteringInterceptor)
  if (existing !== undefined) return
  Reflect.defineMetadata(PARAMTYPES_KEY, [Reflector, MeteringService, Object], MeteringInterceptor)
}
