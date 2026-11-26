import { expect, test } from "bun:test"
import { guardFetch, isAllowedGitRemote, isAllowedURL, NetworkBlockedError } from "../src/network-policy.js"

test.each([
  ["http://127.0.0.1:11434/v1", true],
  ["http://localhost:1234", true],
  ["http://[::1]:80", true],
  ["https://api.github.com/x", false],
  ["https://objects.githubusercontent.com/x", false],
  ["https://huggingface.co/x", false],
  ["https://cdn-lfs.hf.co/x", false],
  ["http://github.com/x", false],
  ["https://evilgithub.com", false],
  ["https://github.com.evil.test", false],
  ["https://github.com@evil.test", false],
  ["https://opencode.ai", false],
  ["https://www.google.com", false],
  ["http://127.0.0.1.evil.test", false],
  ["http://169.254.169.254", false],
  ["http://192.168.1.5", false],
  ["http://x.localhost", false],
  ["ws://localhost:1", true],
  ["wss://github.com", false],
  ["file:///C:/a.txt", true],
  ["file://host/share/a", false],
  ["file:////host/share/a", false],
])("%s allowed: %p", (url, allowed) => expect(isAllowedURL(url)).toBe(allowed))

test("no environment variable adds a host", () => {
  process.env.OPENCODE_ALLOWED_HOSTS = "192.168.1.5,evil.test"
  expect(isAllowedURL("http://192.168.1.5:8000")).toBe(false)
  expect(isAllowedURL("https://evil.test")).toBe(false)
  delete process.env.OPENCODE_ALLOWED_HOSTS
})

test("refuses every method outside this machine", async () => {
  const fetch = guardFetch(async () => new Response("ok"))
  for (const method of ["GET", "POST"])
    await expect(fetch("https://api.github.com/gists", { method })).rejects.toBeInstanceOf(NetworkBlockedError)
  expect(await (await fetch("http://127.0.0.1:11434/api/chat", { method: "POST" })).text()).toBe("ok")
})

test.each([
  ["https://github.com/a/b.git", false],
  ["https://user@github.com/a/b.git", false],
  ["https://huggingface.co/a/b", false],
  ["http://127.0.0.1:3000/a.git", true],
  ["file:///tmp/a.git", true],
  ["/tmp/a.git", true],
  ["../a.git", true],
  ["C:\\repos\\a.git", true],
  ["https://gitlab.com/a/b.git", false],
  ["http://github.com/a/b.git", false],
  ["git@github.com:a/b.git", false],
  ["host:a/b.git", false],
  ["ssh://git@github.com/a/b", false],
  ["git://github.com/a/b", false],
  ["ext::sh -c id", false],
  ["file://host/share/a.git", false],
  ["\\\\host\\share\\a.git", false],
  ["//host/share/a.git", false],
])("git remote %s allowed: %p", (remote, allowed) => expect(isAllowedGitRemote(remote)).toBe(allowed))

test("refuses a redirect to a blocked host", async () => {
  const seen: string[] = []
  const fetch = guardFetch(async (input) => {
    seen.push(String(input))
    return new Response(null, { status: 302, headers: { location: "https://evil.test/" } })
  })
  await expect(fetch("http://127.0.0.1:1/x")).rejects.toBeInstanceOf(NetworkBlockedError)
  expect(seen).toEqual(["http://127.0.0.1:1/x"])
})

test("drops credentials across origins", async () => {
  const auth: (string | null)[] = []
  const fetch = guardFetch(async (input, init) => {
    auth.push(new Headers(init?.headers).get("authorization"))
    return String(input).includes("127.0.0.1:1/")
      ? new Response(null, { status: 302, headers: { location: "http://localhost:2/y" } })
      : new Response("ok")
  })
  const response = await fetch("http://127.0.0.1:1/x", { headers: { authorization: "secret" } })
  expect(await response.text()).toBe("ok")
  expect(auth).toEqual(["secret", null])
})

test("refuses a cloud-hosted Ollama model", async () => {
  const fetch = guardFetch(async () => new Response("ok"))
  const send = (model: string, content = "") =>
    fetch("http://127.0.0.1:11434/v1/chat/completions", { method: "POST", body: JSON.stringify({ model, content }) })
  await expect(send("gpt-oss:120b-cloud")).rejects.toBeInstanceOf(NetworkBlockedError)
  expect(await (await send("qwen3:8b", '"model":"x:cloud"')).text()).toBe("ok")
})

test("follows redirects of requests with a body as fetch does", async () => {
  const seen: string[] = []
  const fetch = guardFetch(async (input, init) => {
    const url = String(input)
    seen.push(`${init?.method} ${url} ${init?.body === undefined ? "-" : String(init.body)}`)
    if (url.endsWith("/a")) return new Response(null, { status: 307, headers: { location: "/b" } })
    if (url.endsWith("/b")) return new Response(null, { status: 303, headers: { location: "/c" } })
    return new Response("ok")
  })
  const response = await fetch("http://127.0.0.1:1/a", { method: "POST", body: "x" })
  expect(await response.text()).toBe("ok")
  expect(seen).toEqual(["POST http://127.0.0.1:1/a x", "POST http://127.0.0.1:1/b x", "GET http://127.0.0.1:1/c -"])
})

test("checks every redirect of a request with a body", async () => {
  const fetch = guardFetch(async () => new Response(null, { status: 308, headers: { location: "https://evil.test/" } }))
  await expect(fetch("http://127.0.0.1:1/a", { method: "POST", body: "x" })).rejects.toBeInstanceOf(NetworkBlockedError)
})
