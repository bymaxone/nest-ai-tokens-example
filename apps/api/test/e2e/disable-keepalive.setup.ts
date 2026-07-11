/**
 * Disables HTTP keep-alive on the Node global agent for the e2e tier.
 *
 * Layer: e2e (jest setup file, runs once per test file).
 * Goal: eliminate cross-file socket reuse. Node 19+ ships
 * `http.globalAgent` with `keepAlive: true`, and jest's single e2e worker
 * runs every suite file in ONE process while core modules (and therefore
 * the global agent's socket pool) survive the per-file module-registry
 * reset. Supertest servers listen on kernel-assigned ephemeral ports, so
 * when the kernel recycles a just-freed port for the next suite's server,
 * the agent can hand a cached socket that is still connected to the
 * PREVIOUS suite's application (possibly a minimal boot variant with a
 * different route table), surfacing as phantom 404s on routes that
 * plainly exist. A non-keep-alive agent closes every connection at
 * response end, so no socket outlives the request that opened it.
 * Mocks: none.
 */
import http from 'node:http'
import https from 'node:https'

http.globalAgent = new http.Agent({ keepAlive: false })
https.globalAgent = new https.Agent({ keepAlive: false })
