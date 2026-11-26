export * as ShellNetwork from "./network.js"

import { realpath } from "node:fs/promises"
import { Effect } from "effect"

// Commands that only touch local files. Anything else may reach the network: an interpreter, a build or a test run
// executes arbitrary code, so a list of network tools would miss most of them. Git is absent: a repository's config
// can name programs that even `git status` runs.
const local = new Set(
  (
    "basename cat cd chdir cmp cp cut date diff dir dirname echo false grep head ls md5sum mkdir mv nl popd printf " +
    "pushd pwd rg rm rmdir sha256sum sleep stat tail test touch tr true type uniq wc where whereis which whoami " +
    "clear-host copy-item get-childitem get-command get-content get-date get-item get-location measure-object " +
    "move-item new-item out-null push-location pop-location remove-item resolve-path select-object select-string " +
    "set-content set-location sort-object test-path write-host write-output"
  ).split(" "),
)

// Expansions and nested commands hide what runs; URLs, `/dev/tcp` and network shares reach another host.
const hidden = /[`$(){}\r\n]|:\/\/|\/dev\/(?:tcp|udp)|[\\/]{2}/i
// Options with which `rg` runs a program.
const runs = /\s--(?:pre|hostname-bin|search-zip)\b/i

// A glob in a command that writes can name `.git` without spelling it.
const writers = new Set("cp mv mkdir touch copy-item move-item new-item set-content".split(" "))

const gitPath = /(?:^|[\\/\s=>:,])(?:\.git|git~\d+)(?![\w-])|\.gitconfig|[\\/]git[\\/]config/i

/** Whether the text names a repository's `.git` or a Git config file, also when quotes or escapes split the name. */
export function gitInternal(text: string) {
  const plain = text.replace(/["'^]/g, "")
  return gitPath.test(plain) || gitPath.test(plain.replaceAll("\\", ""))
}

/**
 * Windows drive letters the text names: `z:\`, `Z:file`, and the `/z/`, `/mnt/z/` and `/cygdrive/z/` spellings.
 * A letter next to `%` is a format placeholder such as `%h:%s`, not a drive.
 */
function drives(text: string) {
  return new Set(
    [
      ...text.matchAll(/(?:^|[^a-z0-9%])([a-z]):(?!%)/gi),
      ...text.matchAll(/(?:^|[\s"'=>])\/(?:mnt\/|cygdrive\/)?([a-z])(?=[\\/\s"']|$)/gi),
    ].map((match) => match[1].toLowerCase()),
  )
}

// A mapped network drive resolves to its share. One that cannot be resolved counts as one.
const remoteDrive = (letter: string) =>
  Effect.promise(() =>
    realpath(`${letter}:\\`).then(
      (real) => !real.toLowerCase().startsWith(`${letter}:`),
      () => true,
    ),
  )

/** Whether the text names a Windows network share or a mapped network drive. */
export const networkPath = Effect.fnUntraced(function* (
  text: string,
  platform: NodeJS.Platform = process.platform,
  remote: (letter: string) => Effect.Effect<boolean> = remoteDrive,
) {
  if (platform !== "win32") return false
  if (/^[\\/]{2}/.test(text)) return true
  for (const letter of drives(text)) if (yield* remote(letter)) return true
  return false
})

/** False only for a command known to stay on this machine. */
export function possible(command: string, parts: readonly string[]) {
  if (parts.length === 0 || hidden.test(command) || runs.test(command) || gitInternal(command)) return true
  const heads = parts.map((part) => part.trim().split(/\s+/)[0]?.toLowerCase() ?? "")
  if (/[*?[]/.test(command) && (command.includes(">") || heads.some((head) => writers.has(head)))) return true
  return !heads.every((head) => local.has(head))
}

export const message = "This command may use the network. 此命令可能联网，请确认后再允许。"

/** Why a file request must reach the user: what it changes could run programs, or it is on another machine. */
export const fileRequest = Effect.fnUntraced(function* (action: string, resources: readonly string[]) {
  if (action === "edit" && resources.some(gitInternal))
    return "This changes Git's own files, which can make Git run programs. 此操作会修改 Git 内部文件，可能让 Git 运行其他程序，请确认。"
  if (action !== "edit" && action !== "external_directory") return undefined
  for (const resource of resources)
    if (yield* networkPath(resource)) return "This path is on a network drive or share. 此路径位于网络盘或网络共享，请确认。"
  return undefined
})

/** Whether a permission request must reach the user whatever rules, saved approvals or hooks say. */
export function flagged(metadata: Readonly<Record<string, unknown>> | undefined) {
  return metadata?.network === true
}
