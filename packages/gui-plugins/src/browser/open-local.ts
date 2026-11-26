import electron from "electron"
import { assertAllowed } from "@opencode/util/network-policy"

/** Opens a page on this machine in the system browser, and refuses any other address. */
export async function openLocal(url: string) {
  assertAllowed(url)
  await electron.shell.openExternal(url)
}
