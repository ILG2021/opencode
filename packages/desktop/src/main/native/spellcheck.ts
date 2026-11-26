import { session, type MenuItemConstructorOptions } from "electron"
import { SPELLCHECK_ENABLED_KEY } from "../storage/keys"
import { getStore } from "../storage/store"
import { nativeT } from "./translations"

// macOS checks spelling with the system spellchecker. Elsewhere Electron downloads dictionaries from a Google server,
// so this build leaves spellcheck off there.
const supported = process.platform === "darwin"

export function applySpellcheck() {
  session.defaultSession.setSpellCheckerEnabled(getSpellcheckEnabled())
}

export function getSpellcheckEnabled() {
  return supported && getStore().get(SPELLCHECK_ENABLED_KEY) !== false
}

export function setSpellcheckEnabled(enabled: boolean) {
  if (!supported) return
  getStore().set(SPELLCHECK_ENABLED_KEY, enabled)
  session.defaultSession.setSpellCheckerEnabled(enabled)
}

export function spellcheckMenuItems(): MenuItemConstructorOptions[] {
  if (!supported) return []
  const enabled = getSpellcheckEnabled()

  return [
    { type: "separator" },
    {
      label: nativeT("desktop.contextMenu.spellcheck"),
      type: "checkbox",
      checked: enabled,
      click: () => setSpellcheckEnabled(!enabled),
    },
  ]
}
