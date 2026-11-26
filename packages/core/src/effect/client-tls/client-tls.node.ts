// The deep path keeps Vite, which runs under Bun where "undici" is a built-in, from leaving the import external.
import { guardFetch } from "@opencode/util/network-policy"
import { Agent, fetch } from "undici/index.js"
import type { Sender, Tls } from "./client-tls.js"

// Node's fetch only takes a client certificate through an undici dispatcher, and a dispatcher from the npm package
// only works with that package's own fetch, not Node's bundled one. One agent per certificate keeps its connections.
// This fetch is not the global one the network policy replaces, so it is guarded here.
const guarded = guardFetch(fetch as unknown as Parameters<typeof guardFetch>[0])

const agents = new Map<string, Agent>()

export function sender(tls: Tls): Sender | undefined {
  const id = JSON.stringify([tls.cert, tls.key, tls.passphrase])
  const agent = agents.get(id) ?? new Agent({ connect: { cert: tls.cert, key: tls.key, passphrase: tls.passphrase } })
  agents.set(id, agent)
  // SAFETY: undici's fetch implements the WHATWG fetch contract that FetchHttpClient and the AI SDK call.
  return { fetch: guarded as typeof globalThis.fetch, init: { dispatcher: agent } }
}

export * as ClientTls from "./client-tls.node.js"
