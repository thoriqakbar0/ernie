import { Effect } from "effect"

type BrowserAddress = { ok: true; url: string } | { ok: false; error: string }

/** Validates browser navigation without allowing credentials or privileged URL schemes. */
export function parseBrowserAddress(input: string, inferScheme = true): BrowserAddress {
  return Effect.runSync(Effect.match(Effect.try({
    try: () => {
      const text = input.trim()
      if (!text) throw new Error("Enter a website address.")
      const url = new URL(inferScheme && !text.includes("://") ? `https://${text}` : text)
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
        throw new Error("Use an HTTP or HTTPS address without credentials.")
      }
      return url.href
    },
    catch: () => "Enter an HTTP or HTTPS address without credentials.",
  }), {
    onSuccess: (url): BrowserAddress => ({ ok: true, url }),
    onFailure: (error): BrowserAddress => ({ ok: false, error }),
  }))
}
