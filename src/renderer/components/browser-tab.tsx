import { parseBrowserAddress } from "../../packages/browser"
import { createElement, useEffect, useRef, useState } from "react"
import type { WebviewTag } from "electron"
import * as stylex from "@stylexjs/stylex"
import { styles } from "./browser.styles"

/** Owns one Chromium guest; hiding the tab preserves its page and navigation history. */
export function BrowserTab({ id, url, visible, onLocationChange }: { id: string; url: string; visible: boolean; onLocationChange: (id: string, url: string) => void }) {
  const guest = useRef<WebviewTag | null>(null)
  const [address, setAddress] = useState(url)
  const editingAddress = useRef(false)
  const navigation = useRef(0)
  const [state, setState] = useState({ ready: false, back: false, forward: false, loading: true })
  const [error, setError] = useState<string>()
  useEffect(() => {
    const view = guest.current
    if (!view) return
    const update = () => {
      setState({ ready: true, back: view.canGoBack(), forward: view.canGoForward(), loading: view.isLoading() })
      const location = view.getURL() || url
      if (!editingAddress.current) setAddress(location)
      if (parseBrowserAddress(location, false).ok) onLocationChange(id, location)
    }
    const failed = (event: Electron.DidFailLoadEvent) => {
      if (event.isMainFrame && event.errorCode !== -3) setError(`Page could not load: ${event.errorDescription}`)
    }
    const attached = () => setState(value => ({ ...value, ready: true }))
    const started = () => { setError(undefined); setState(value => ({ ...value, loading: true })) }
    view.addEventListener("did-attach", attached)
    view.addEventListener("dom-ready", update)
    view.addEventListener("did-navigate", update)
    view.addEventListener("did-navigate-in-page", update)
    view.addEventListener("did-stop-loading", update)
    view.addEventListener("did-start-loading", started)
    view.addEventListener("did-fail-load", failed)
    return () => {
      navigation.current += 1
      view.removeEventListener("did-attach", attached)
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
    if (!view) return
    editingAddress.current = false
    const request = ++navigation.current
    setError(undefined)
    void view.loadURL(result.url).catch((cause: unknown) => {
      if (request !== navigation.current) return
      if (cause instanceof Error && "code" in cause && cause.code === "ERR_ABORTED") return
      setError("Page could not load. Check the address and retry.")
    })
  }

  return <section aria-label="Browser page" hidden={!visible} {...stylex.props(styles.page, !visible && styles.hidden)}>
    <form {...stylex.props(styles.toolbar)} onSubmit={event => { event.preventDefault(); navigate() }}>
      <button type="button" disabled={!state.back} aria-label="Back" {...stylex.props(styles.button)} onClick={() => { editingAddress.current = false; navigation.current += 1; guest.current?.goBack() }}>←</button>
      <button type="button" disabled={!state.forward} aria-label="Forward" {...stylex.props(styles.button)} onClick={() => { editingAddress.current = false; navigation.current += 1; guest.current?.goForward() }}>→</button>
      <button type="button" disabled={!state.ready} {...stylex.props(styles.button)} onClick={() => { navigation.current += 1; if (state.loading) guest.current?.stop(); else guest.current?.reload() }}>{state.loading ? "Stop" : "Reload"}</button>
      <input aria-label="Page address" value={address} onChange={event => { editingAddress.current = true; setAddress(event.target.value) }} {...stylex.props(styles.address)}/>
      <button type="submit" disabled={!state.ready} {...stylex.props(styles.button)}>Go</button>
    </form>
    {error ? <p role="alert" {...stylex.props(styles.notice)}>{error}</p> : null}
    {createElement("webview", { ref: guest, src: url, partition: "persist:ernie-browser", webpreferences: "contextIsolation=true,sandbox=true,nodeIntegration=false", ...stylex.props(styles.guest) })}
  </section>
}
