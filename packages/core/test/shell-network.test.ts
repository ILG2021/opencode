import { expect, test } from "bun:test"
import { Effect } from "effect"
import { ShellNetwork } from "@opencode/core/shell/network"
import { ShellParse } from "@opencode/core/shell/parse"

// As `ShellPermissions` does: a command the scanner cannot read always asks.
const asks = (command: string, program: string) =>
  Effect.runSync(
    ShellParse.scan(command, program, "/project").pipe(
      Effect.map((parsed) => ShellNetwork.possible(command, parsed.commands.map((item) => item.resource))),
      Effect.orElseSucceed(() => true),
    ),
  )

test.each([
  "ls -la", "cat a.txt | grep x", "pwd; wc -l a", "rg todo src", "mkdir -p a/b",
])("%s stays local", (command) => expect(asks(command, "bash")).toBe(false))

test.each([
  "curl https://a.test", "cat a && curl a.test", "cat a | nc host 1", "CURL a.test", "/usr/bin/curl a.test", "./x",
  "env curl a.test", "X=1 curl a.test", "sudo ls", "python a.py", "node -e 1", "npm test", "make", "git push",
  "git fetch", "git clone x", "git -c a=b status", "git commit -m x", "echo $(curl a.test)", "echo `curl a.test`",
  "cat a > /dev/tcp/host/80", "cat //host/share/a", "rg --pre curl x", "git diff --ext-diff", "git status", "git log", "git add .", "bash -c 'curl a'",
  "find . -exec curl {} ;", "eval curl a", "ssh host", "ls\ncurl a.test", "ls & curl a.test", "cp a .git/config", "cat a > .git/config", "cp a .g'i't/config", "cp a .g\\it/config", "cp a .g?t/config", "echo a > */config", "cp a GIT~1/config", "mv x .git", "cd .git", "cp a ~/.gitconfig",
])("%s asks", (command) => expect(asks(command, "bash")).toBe(true))

test.each(["Invoke-WebRequest http://a", "iwr a.test", "irm a.test", "Get-Content (iwr a)", "Get-Content \\\\host\\share\\a", "Start-Process curl", "Test-Connection a", "Get-ChildItem; curl a"])(
  "PowerShell %s asks", (command) => expect(asks(command, "pwsh")).toBe(true),
)

test("PowerShell local commands do not", () => {
  expect(asks("Get-ChildItem src", "pwsh")).toBe(false)
  expect(asks("Get-Content a.txt | Select-String x", "pwsh")).toBe(false)
})

test.each(["cat .gitignore", "ls *.ts", "rm *.tmp", "cp a.txt b.txt", "ls .github"])("%s stays local too", (command) =>
  expect(asks(command, "bash")).toBe(false),
)

test("names Git's own files", () => {
  for (const file of [".git/config", "a/.git/hooks/x", "C:/p/.GIT/config", "C:\\p\\.git\\config", ".git./config"])
    expect(ShellNetwork.gitInternal(file)).toBe(true)
  for (const file of [".gitignore", ".github/a.yml", "src/git.ts", "a.git-b"]) expect(ShellNetwork.gitInternal(file)).toBe(false)
})

test("finds network drives", () => {
  const on = (text: string, platform: NodeJS.Platform = "win32") =>
    Effect.runSync(ShellNetwork.networkPath(text, platform, (letter) => Effect.succeed(letter === "z")))
  for (const text of ["cp a Z:\\", "cp a z:b", "cp a /z/b", "cp a '/mnt/z/b'", "cp a /cygdrive/z", "Z:/x/*", "//host/share/a"])
    expect(on(text)).toBe(true)
  for (const text of ["cp a C:\\b", "cp a /c/b", "cp a b", "src/z/a", "git log --format=%h:%s", "date +%z:%Z"])
    expect(on(text)).toBe(false)
  expect(on("cp a /z/b", "linux")).toBe(false)
})
