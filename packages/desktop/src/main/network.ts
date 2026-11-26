import { app, session, type Session } from "electron"
import { installNetworkPolicy, isAllowedURL } from "@opencode/util/network-policy"
import { installSocketPolicy } from "@opencode/util/network-policy-node"

const guarded = new WeakSet<Session>()

function guard(target: Session) {
  if (guarded.has(target)) return
  guarded.add(target)
  // Electron fetches Hunspell dictionaries outside webRequest, so their download URL goes nowhere.
  target.setSpellCheckerDictionaryDownloadURL("http://127.0.0.1:9/")
  target.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] }, (details, callback) =>
    callback({ cancel: !isAllowedURL(details.url) }),
  )
}

/** Keeps the main process and every window, web view and browser profile on this machine. Runs before ready. */
export function configureNetwork() {
  installNetworkPolicy()
  installSocketPolicy()
  app.on("session-created", guard)
  void app.whenReady().then(() => guard(session.defaultSession))
}
