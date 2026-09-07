import { parseBrowserAddress } from "../../packages/browser"
import { createElement, useEffect, useRef, useState } from "react"
import type { WebviewTag } from "electron"
import * as stylex from "@stylexjs/stylex"
import { styles } from "./browser.styles"

/** Owns one Chromium guest; hiding the tab preserves its page and navigation history. */
export function BrowserTab({ id, url, visible, onLocationChange }: { id: string; url: string; visible: boolean; onLocationChange: (id: string, url: string) => void }) {
  const guest = useRef<WebviewTag | null>(null)
  const [address, setAddress] = useState(url)
  const [state, setState] = useState({ ready: false, back: false, forward: false, loading: true })
  const [error, setError] = useState<string>()
  useEffect(() => {
    const view = guest.current
    if (!view) return
    const update = () => {
      setState({ ready: true, back: view.canGoBack(), forward: view.canGoForward(), loading: view.isLoading() })
      const location = view.getURL() || url
      setAddress(location)
      if (parseBrowserAddress(location, false).ok) onLocationChange(id, location)
    }
    const failed = (event: Electron.DidFailLoadEvent) => {
      if (event.isMainFrame && event.errorCode !== -3) setError(`Page could not load: ${event.errorDescription}`)
    }
    const started = () => { setError(undefined); setState(value => ({ ...value, loading: true })) }
    view.addEventListener("dom-ready", update)
    view.addEventListener("did-navigate", update)
    view.addEventListener("did-navigate-in-page", update)
    view.addEventListener("did-stop-loading", update)
    view.addEventListener("did-start-loading", started)
    view.addEventListener("did-fail-load", failed)
    return () => {
      view.removeEventListener("dom-ready", update)
      view.removeEventListener("did-navigate", update)
      view.removeEventListener("did-navigate-in-page", update)
      view.removeEventListener("did-stop-loading", update)
      view.removeEventListener("did-start-loading", started)
      view.removeEventListener("did-fail-load", failed)
    }
  }, [id, url, onLocationChange])
  function navigate() {
    const result = parseBrowserAddress(address)
    if (!result.ok) { setError(result.error); return }
    const view = guest.current
    if (view) void view.loadURL(result.url).catch(() => setError("Page could not load. Check the address and retry."))
  }

  return <section aria-label="Browser page" hidden={!visible} {...stylex.props(styles.page, !visible && styles.hidden)}>
    <form {...stylex.props(styles.toolbar)} onSubmit={event => { event.preventDefault(); navigate() }}>
      <button type="button" disabled={!state.back} aria-label="Back" {...stylex.props(styles.button)} onClick={() => guest.current?.goBack()}>←</button>
      <button type="button" disabled={!state.forward} aria-label="Forward" {...stylex.props(styles.button)} onClick={() => guest.current?.goForward()}>→</button>
      <button type="button" disabled={!state.ready} {...stylex.props(styles.button)} onClick={() => state.loading ? guest.current?.stop() : guest.current?.reload()}>{state.loading ? "Stop" : "Reload"}</button>
      <input aria-label="Page address" value={address} onChange={event => setAddress(event.target.value)} {...stylex.props(styles.address)}/>
      <button type="submit" disabled={!state.ready} {...stylex.props(styles.button)}>Go</button>
    </form>
    {error ? <p role="alert" {...stylex.props(styles.notice)}>{error}</p> : null}
    {createElement("webview", { ref: guest, src: url, partition: "persist:ernie-browser", webpreferences: "contextIsolation=true,sandbox=true,nodeIntegration=false", ...stylex.props(styles.guest) })}
  </section>
}
