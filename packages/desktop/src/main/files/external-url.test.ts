import { describe, expect, test } from "bun:test"
import { resolveExternalURL } from "./external-url"

describe("external URLs", () => {
  test("opens only pages on this machine externally", () => {
    expect(resolveExternalURL("http://127.0.0.1:3000/a?b=c")).toBe("http://127.0.0.1:3000/a?b=c")

    for (const url of ["https://example.com/", "mailto:hello@opencode.ai", "file:///tmp/index.html", "javascript:alert(1)", "data:text/html,hello", "not a url"])
      expect(resolveExternalURL(url)).toBeUndefined()
  })

})
