/**
 * Loopback-bound HTTP listener for supertest.
 *
 * Layer: e2e (shared harness helper).
 * Goal: bind the application's HTTP server to 127.0.0.1 EXPLICITLY before
 * handing it to supertest. When supertest starts a non-listening server
 * itself it binds the WILDCARD address while its client connects to
 * 127.0.0.1; on macOS any other process (a Docker port proxy for a
 * Testcontainers mapping, another project's service) may then bind
 * 127.0.0.1 on that same port, and the more specific bind SHADOWS the
 * wildcard listener, so requests land on a foreign server (phantom 404s,
 * wrong-shape 200s, or raw non-HTTP bytes). Owning 127.0.0.1:port
 * exclusively makes that collision an EADDRINUSE for the other process
 * instead of silent cross-talk.
 * Mocks: none.
 */
import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import type { App } from 'supertest/types.js'

/**
 * Start the app's HTTP server on an ephemeral loopback port.
 *
 * @param app The booted (init-ed, not yet listening) Nest application.
 * @returns The listening server, ready for `supertest.request()`.
 */
export async function listenLocal(app: INestApplication): Promise<App> {
  const server = app.getHttpServer() as Server
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  return server
}
