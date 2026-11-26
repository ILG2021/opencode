// Exact names only: a resolver may send `*.localhost` elsewhere.
const loopback = /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])$/
const redirects = new Set([301, 302, 303, 307, 308])
const maxRedirects = 10

export class NetworkBlockedError extends Error {
  constructor(host: string) {
    super(`Blocked by the local-only network policy: ${host}`)
    this.name = "NetworkBlockedError"
  }
}

/** Only this machine. No setting or environment variable adds a host. */
export function isAllowedURL(input: string | URL) {
  const url = URL.parse(String(input))
  if (!url) return false
  if (url.protocol === "data:" || url.protocol === "blob:") return true
  // `file://host/share` and `file:////host/share` are Windows network shares, which would send credentials.
  if (url.protocol === "file:") return url.hostname === "" && !/^\/*(?:[\\/]|%2f|%5c){2}/i.test(url.pathname)
  return loopback.test(url.hostname.toLowerCase().replace(/\.$/, ""))
}

export function assertAllowed(input: string | URL) {
  if (isAllowedURL(input)) return
  throw new NetworkBlockedError(URL.parse(String(input))?.hostname ?? String(input))
}

/** A raw TCP target, such as one a browser tunnel dials. */
export function isAllowedHost(host: string) {
  const name = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host
  return isAllowedURL(`https://${name}/`)
}

/**
 * A Git remote as Git resolves it: loopback HTTP(S) or a path on this machine. SSH, scp-like remotes, remote helpers and Windows network shares are refused.
 */
export function isAllowedGitRemote(remote: string) {
  if (/^[a-z][a-z0-9+.-]*::/i.test(remote) || /^[\\/]{2}/.test(remote)) return false
  if (remote.includes("://")) {
    const url = URL.parse(remote)
    if (url?.protocol === "file:") return url.hostname === "" && !/^\/*[\\/]{2}/.test(url.pathname)
    return (url?.protocol === "https:" || url?.protocol === "http:") && isAllowedURL(url)
  }
  if (/^[a-z]:[\\/]/i.test(remote)) return true
  // A colon before the first slash makes it scp-like: `host:path`.
  return !/^[^/\\]*:/.test(remote)
}

// Ollama names its hosted models `…:cloud` or `…-cloud` and forwards their prompts to another host. A quote inside a
// JSON string is escaped, so prompt text cannot match.
const cloudModel = /"model"\s*:\s*"[^"\\]*[:-]cloud"/

function assertLocalModel(body: unknown) {
  const text =
    typeof body === "string"
      ? body
      : body instanceof Uint8Array || body instanceof ArrayBuffer
        ? new TextDecoder().decode(body)
        : undefined
  if (text !== undefined && cloudModel.test(text)) throw new NetworkBlockedError("cloud-hosted Ollama model")
}

type Fetch = (input: Request | string | URL, init?: RequestInit) => Promise<Response>

/**
 * Checks the first URL and every redirect. Redirects are followed as fetch follows them: 307 and 308 repeat the method
 * and body, and 301, 302 and 303 turn a POST (303: any method but HEAD) into a body-less GET.
 */
export function guardFetch(fetch: Fetch): Fetch {
  return async (input, init) => {
    const first = input instanceof Request ? input.url : String(input)
    const request = input instanceof Request ? input : undefined
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase()
    assertAllowed(first)
    const bodyless = method === "GET" || method === "HEAD"
    // A request's body can be read once, so it is kept as bytes for a redirect that repeats it.
    const body = bodyless
      ? undefined
      : init?.body !== undefined && init.body !== null
        ? init.body
        : request?.body
          ? await request.clone().arrayBuffer()
          : undefined
    assertLocalModel(body)
    const mode = init?.redirect ?? request?.redirect ?? "follow"
    if (mode !== "follow") return fetch(input, init)
    const response = await fetch(input, { ...init, redirect: "manual" })
    if (!redirects.has(response.status) || !response.headers.has("location")) return response
    // A stream cannot be sent twice, so a redirect that must repeat it is returned as is.
    if (body instanceof ReadableStream && (response.status === 307 || response.status === 308)) return response

    const headers = new Headers(init?.headers ?? request?.headers)
    let current = response
    let url = first
    let currentMethod = method
    let currentBody = body
    for (let hop = 0; hop < maxRedirects; hop++) {
      const location = current.headers.get("location")
      if (!redirects.has(current.status) || location === null) return current
      const next = new URL(location, url)
      assertAllowed(next)
      await current.body?.cancel()
      if (next.origin !== new URL(url).origin)
        ["authorization", "cookie", "proxy-authorization"].forEach((name) => headers.delete(name))
      if (
        (current.status === 303 && currentMethod !== "HEAD") ||
        ((current.status === 301 || current.status === 302) && currentMethod === "POST")
      ) {
        currentMethod = "GET"
        currentBody = undefined
        ;["content-type", "content-length", "content-encoding", "content-language", "content-location"].forEach((name) =>
          headers.delete(name),
        )
      }
      url = next.href
      current = await fetch(url, {
        ...init,
        method: currentMethod,
        headers,
        body: currentBody,
        signal: init?.signal ?? request?.signal,
        redirect: "manual",
      })
    }
    throw new TypeError("Too many redirects")
  }
}

export function installNetworkPolicy() {
  const original = globalThis.fetch
  globalThis.fetch = Object.assign(guardFetch(original.bind(globalThis) as Fetch), {
    preconnect: () => {},
  }) as typeof globalThis.fetch
  const Guarded = class extends globalThis.WebSocket {
    constructor(url: string | URL, options?: string | string[]) {
      assertAllowed(url)
      super(url, options)
    }
  }
  // SAFETY: the subclass passes every argument through, and only Bun's wider constructor options differ in type.
  globalThis.WebSocket = Guarded as typeof globalThis.WebSocket
}
