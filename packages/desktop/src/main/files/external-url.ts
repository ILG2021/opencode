import { isAllowedURL } from "@opencode/util/network-policy"

/** Only pages on this machine open in the system browser. */
export function resolveExternalURL(value: string) {
  if (!URL.canParse(value)) return undefined
  const url = new URL(value)

  if ((url.protocol === "http:" || url.protocol === "https:") && isAllowedURL(url)) return url.href

  return undefined
}
