import { parseBrowserAddress } from "../../packages/browser"
import { ArrowLeftIcon, ArrowRightIcon, Globe2Icon, RotateCwIcon, SquareIcon } from "lucide-react"
import { createElement, useEffect, useEffectEvent, useRef, useState } from "react"
import type { WebviewTag } from "electron"
import * as stylex from "@stylexjs/stylex"
import { BrowserButton } from "./browser-button"
import { styles } from "./browser.styles"

/** Owns one Chromium guest; hiding the tab preserves its page, draft address, and history. */
export const BrowserTab = ({
  id,
  visible,
  onPageChange,
}: {
  id: string
  visible: boolean
  onPageChange: (id: string, url: string, title: string) => void
}) => {
  const guest = useRef<WebviewTag | null>(null)
  const [source, setSource] = useState<string>()
  useEffect(() => {
    if (!visible) return
    const refresh = (event: Event) => {
      if (!guest.current || !source) return
      if (event instanceof CustomEvent && event.detail?.ignoreCache === true) guest.current.reloadIgnoringCache()
      else guest.current.reload()
    }
    window.addEventListener("ernie:refresh-browser", refresh)
    return () => window.removeEventListener("ernie:refresh-browser", refresh)
  }, [visible, source])
  const input = useRef<HTMLInputElement>(null)
  const [address, setAddress] = useState("")
  const focusedNewTab = useRef(false)
  const editingAddress = useRef(false)
  const navigation = useRef(0)
  const [state, setState] = useState({ back: false, forward: false, loading: false, ready: false })
  const [addressError, setAddressError] = useState<string>()
  const [loadError, setLoadError] = useState<string>()
  const desktop = navigator.userAgent.includes("Electron/")
  const publishPage = useEffectEvent((location: string, title: string) =>
    onPageChange(id, location, title),
  )
  useEffect(() => {
    if (visible && !focusedNewTab.current) {
      input.current?.focus()
      focusedNewTab.current = true
    }
  }, [visible])
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
      const location = view.getURL() || source || ""
      if (!editingAddress.current) {
        setAddress(location)
      }
      const result = parseBrowserAddress(location, false)
      if (result.ok) {
        publishPage(result.url, view.getTitle().trim() || new URL(result.url).host)
      }
    }
    const failed = (event: Electron.DidFailLoadEvent) => {
      if (event.isMainFrame && event.errorCode !== -3) {
        setLoadError("This page could not load. Check the address or your connection, then retry.")
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
    view.addEventListener("page-title-updated", update)
    view.addEventListener("did-stop-loading", update)
    view.addEventListener("did-start-loading", started)
    view.addEventListener("did-fail-load", failed)
    return () => {
      navigation.current += 1
      view.removeEventListener("did-attach", attached)
      view.removeEventListener("dom-ready", update)
      view.removeEventListener("did-navigate", update)
      view.removeEventListener("did-navigate-in-page", update)
      view.removeEventListener("page-title-updated", update)
      view.removeEventListener("did-stop-loading", update)
      view.removeEventListener("did-start-loading", started)
      view.removeEventListener("did-fail-load", failed)
    }
  }, [source])
  const navigate = async () => {
    const result = parseBrowserAddress(address)
    if (!result.ok) {
      setAddressError(result.error)
      input.current?.focus()
      return
    }
    setAddressError(undefined)
    if (!desktop) {
      return
    }
    editingAddress.current = false
    setAddress(result.url)
    setLoadError(undefined)
    if (!source) {
      setSource(result.url)
      setState((value) => ({ ...value, loading: true }))
      onPageChange(id, result.url, new URL(result.url).host)
      return
    }
    const view = guest.current
    if (!view || !state.ready) {
      return
    }
    navigation.current += 1
    const request = navigation.current
    try {
      await view.loadURL(result.url)
    } catch (error: unknown) {
      if (request !== navigation.current) {
        return
      }
      if (error instanceof Error && "code" in error && error.code === "ERR_ABORTED") {
        return
      }
      setLoadError("This page could not load. Check the address or your connection, then retry.")
    }
  }

  return (
    <section
      id={`browser-page-${id}`}
      role="tabpanel"
      aria-labelledby={`browser-tab-${id}`}
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
        <fieldset aria-label="Page navigation" {...stylex.props(styles.navigation)}>
          <BrowserButton
            label="Back"
            icon={ArrowLeftIcon}
            disabled={!state.back}
            onClick={() => {
              editingAddress.current = false
              navigation.current += 1
              guest.current?.goBack()
            }}
          />
          <BrowserButton
            label="Forward"
            icon={ArrowRightIcon}
            disabled={!state.forward}
            onClick={() => {
              editingAddress.current = false
              navigation.current += 1
              guest.current?.goForward()
            }}
          />
          <BrowserButton
            label={state.loading ? "Stop loading" : "Reload page"}
            icon={state.loading ? SquareIcon : RotateCwIcon}
            disabled={!state.ready}
            onClick={() => {
              navigation.current += 1
              if (state.loading) {
                guest.current?.stop()
              } else {
                guest.current?.reload()
              }
            }}
          />
        </fieldset>
        <div {...stylex.props(styles.addressField)}>
          <input
            ref={input}
            aria-label="Page address"
            disabled={!desktop}
            name="address"
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="localhost:3000"
            aria-invalid={Boolean(addressError)}
            aria-describedby={addressError ? `browser-address-error-${id}` : undefined}
            value={address}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => {
              editingAddress.current = true
              setAddress(event.target.value)
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                editingAddress.current = false
                setAddress(state.ready ? guest.current?.getURL() || source || "" : source || "")
                setAddressError(undefined)
                event.currentTarget.blur()
              }
            }}
            {...stylex.props(styles.address)}
          />
          <BrowserButton
            label="Go to address"
            icon={ArrowRightIcon}
            type="submit"
            disabled={!desktop || (Boolean(source) && !state.ready)}
          />
        </div>
      </form>
      {addressError ? (
        <p
          id={`browser-address-error-${id}`}
          role="alert"
          {...stylex.props(styles.notice, styles.errorNotice)}
        >
          {addressError}
        </p>
      ) : null}
      {loadError ? (
        <div role="alert" {...stylex.props(styles.error)}>
          <p {...stylex.props(styles.errorMessage)}>{loadError}</p>
          <button
            type="button"
            {...stylex.props(styles.button, styles.retry)}
            onClick={() => {
              void navigate()
            }}
          >
            Retry
          </button>
        </div>
      ) : null}
      {source ? (
        // React receives this ref object; no current value is read during render.
        // oxlint-disable-next-line react/refs
        createElement("webview", {
          partition: "persist:ernie-browser",
          ref: guest,
          src: source,
          webpreferences: "contextIsolation=true,sandbox=true,nodeIntegration=false",
          ...stylex.props(styles.guest),
        })
      ) : (
        <div {...stylex.props(styles.empty)}>
          <Globe2Icon size={28} aria-hidden="true" {...stylex.props(styles.emptyIcon)} />
          <h2 {...stylex.props(styles.emptyTitle)}>Browse the web</h2>
          <p {...stylex.props(styles.emptyDescription)}>
            {desktop
              ? "Enter a website or localhost address above."
              : "Website previews are available in the desktop app."}
          </p>
        </div>
      )}
    </section>
  )
}
