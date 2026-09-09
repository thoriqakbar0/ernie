import { Schema } from "effect"

const ModelPreference = Schema.Struct({ provider: Schema.String, model: Schema.String })
type ModelPreference = typeof ModelPreference.Type
const storageKey = "ernie:composer-model:v1"
let remembered: ModelPreference | undefined

/** Restores the last composer choice; invalid or unavailable storage uses Agent defaults. */
export const readComposerModel = (): ModelPreference => {
  if (remembered) return remembered
  try {
    const stored = localStorage.getItem(storageKey)
    if (stored) {
      const parsed = Schema.decodeUnknownOption(ModelPreference)(JSON.parse(stored))
      if (parsed._tag === "Some") return parsed.value
    }
  } catch {
    // Storage is optional; model selection must remain usable without it.
  }
  return { provider: "", model: "" }
}

/** Remembers a draft choice or accepted native change; never changes an existing session. */
export const saveComposerModel = (provider: string, model: string): void => {
  remembered = { provider, model }
  try {
    localStorage.setItem(storageKey, JSON.stringify(remembered))
  } catch {
    // Retain the choice for this app lifetime when persistent storage is unavailable.
  }
}
