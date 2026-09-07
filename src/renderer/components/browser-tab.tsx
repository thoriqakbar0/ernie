import { parseBrowserAddress } from "../../packages/browser"
import { createElement, useEffect, useEffectEvent, useRef, useState } from "react"
import type { WebviewTag } from "electron"
import * as stylex from "@stylexjs/stylex"
import { styles } from "./browser.styles"

/** Owns one Chromium guest; hiding the tab preserves its page and navigation history. */
export const BrowserTab = ({
  id,
  url,
  visible,
  onLocationChange,
}: {
  id: string
  url: string
  visible: boolean
  onLocationChange: (id: string, url: string) => void
}) => {
  const guest = useRef<WebviewTag | null>(null)
  const [address, setAddress] = useState(url)
  const editingAddress = useRef(false)
  const navigation = useRef(0)
  const [state, setState] = useState({ back: false, forward: false, loading: true, ready: false })
  const [loadError, setLoadError] = useState<string>()
  const publishLocation = useEffectEvent((location: string) => onLocationChange(id, location))
  useEffect(() => {
    const view = guest.current
    if (!view) {
      return
    }
    const update = () => {
      setState({
        back: view.canGoBack(),
        forward: view.canGoForward(),
        loading: view.isLoading(),
        ready: true,
      })
      const location = view.getURL() || url
      if (!editingAddress.current) {
        setAddress(location)
      }
      if (parseBrowserAddress(location, false).ok) {
        publishLocation(location)
      }
    }
    const failed = (event: Electron.DidFailLoadEvent) => {
      if (event.isMainFrame && event.errorCode !== -3) {
        setLoadError(`Page could not load: ${event.errorDescription}`)
      }
    }
    const attached = () => setState((value) => ({ ...value, ready: true }))
    const started = () => {
      setLoadError(undefined)
      setState((value) => ({ ...value, loading: true }))
    }
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
  }, [url])
  const navigate = async () => {
    const result = parseBrowserAddress(address)
    if (!result.ok) {
      setLoadError(result.error)
      return
    }
    const view = guest.current
    if (!view) {
      return
    }
    editingAddress.current = false
    navigation.current += 1
    const request = navigation.current
    setLoadError(undefined)
    try {
      await view.loadURL(result.url)
    } catch (error: unknown) {
      if (request !== navigation.current) {
        return
      }
      if (error instanceof Error && "code" in error && error.code === "ERR_ABORTED") {
        return
      }
      setLoadError("Page could not load. Check the address and retry.")
    }
  }

  return (
    <section
      aria-label="Browser page"
      hidden={!visible}
      {...stylex.props(styles.page, !visible && styles.hidden)}
    >
      <form
        {...stylex.props(styles.toolbar)}
        onSubmit={(event) => {
          event.preventDefault()
          void navigate()
        }}
      >
        <button
          type="button"
          disabled={!state.back}
          aria-label="Back"
          {...stylex.props(styles.button)}
          onClick={() => {
            editingAddress.current = false
            navigation.current += 1
            guest.current?.goBack()
          }}
        >
          ←
        </button>
        <button
          type="button"
          disabled={!state.forward}
          aria-label="Forward"
          {...stylex.props(styles.button)}
          onClick={() => {
            editingAddress.current = false
            navigation.current += 1
            guest.current?.goForward()
          }}
        >
          →
        </button>
        <button
          type="button"
          disabled={!state.ready}
          {...stylex.props(styles.button)}
          onClick={() => {
            navigation.current += 1
            if (state.loading) {
              guest.current?.stop()
            } else {
              guest.current?.reload()
            }
          }}
        >
          {state.loading ? "Stop" : "Reload"}
        </button>
        <input
          aria-label="Page address"
          value={address}
          onChange={(event) => {
            editingAddress.current = true
            setAddress(event.target.value)
          }}
          {...stylex.props(styles.address)}
        />
        <button type="submit" disabled={!state.ready} {...stylex.props(styles.button)}>
          Go
        </button>
      </form>
      {loadError ? (
        <p role="alert" {...stylex.props(styles.notice)}>
          {loadError}
        </p>
      ) : null}
      {createElement("webview", {
        partition: "persist:ernie-browser",
        ref: guest,
        src: url,
        webpreferences: "contextIsolation=true,sandbox=true,nodeIntegration=false",
        ...stylex.props(styles.guest),
      })}
    </section>
  )
}
