import { parseBrowserAddress } from "../../packages/browser"
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import * as stylex from "@stylexjs/stylex"
import { BrowserTab } from "./browser-tab"
import { styles } from "./browser.styles"

type Tab = { id: string; url: string; location: string }

/** Keeps browser tabs alive beside the workspace until explicitly closed. */
export function BrowserWorkspace({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [tabs, setTabs] = useState<Tab[]>([])
  const [selected, setSelected] = useState<string>()
  const [address, setAddress] = useState("")
  const [error, setError] = useState<string>()
  const opener = useRef<HTMLButtonElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const desktop = navigator.userAgent.includes("Electron/")
  useEffect(() => { if (open) input.current?.focus() }, [open])
  const updateLocation = useCallback((id: string, location: string) => {
    setTabs(current => current.map(tab => tab.id === id && tab.location !== location ? { ...tab, location } : tab))
  }, [])
  const closePanel = () => { setOpen(false); opener.current?.focus() }
  function addTab() {
    const result = parseBrowserAddress(address)
    if (!result.ok) { setError(result.error); return }
    const id = crypto.randomUUID()
    setTabs(current => [...current, { id, url: result.url, location: result.url }])
    setSelected(id)
    setAddress("")
    setError(undefined)
  }

  return <div {...stylex.props(styles.workspace)}>
    <div {...stylex.props(styles.launcher)}><button ref={opener} type="button" aria-expanded={open} aria-controls="ernie-browser" {...stylex.props(styles.button)} onClick={() => { setOpen(value => !value) }}>Browser</button></div>
    <div {...stylex.props(styles.split, open && styles.splitOpen)}>
      <div {...stylex.props(styles.conversation)}>{children}</div>
      <aside id="ernie-browser" aria-label="Browser" hidden={!open} {...stylex.props(styles.panel, !open && styles.hidden)}>
        <div {...stylex.props(styles.toolbar)}><h2 {...stylex.props(styles.title)}>Browser</h2><button type="button" {...stylex.props(styles.button)} onClick={closePanel}>Close panel</button></div>
        {!desktop ? <p {...stylex.props(styles.notice)}>Embedded browsing is available in the Ernie desktop app.</p> : <>
          <form {...stylex.props(styles.toolbar)} onSubmit={event => { event.preventDefault(); addTab() }}>
            <input ref={input} aria-label="Address for new tab" placeholder="https://example.com" value={address} onChange={event => setAddress(event.target.value)} {...stylex.props(styles.address)}/>
            <button type="submit" {...stylex.props(styles.button)}>Open tab</button>
          </form>
          {error ? <p role="alert" {...stylex.props(styles.notice)}>{error}</p> : null}
          <div aria-label="Browser tabs" {...stylex.props(styles.tabs)}>{tabs.map(tab => <div key={tab.id} {...stylex.props(styles.tab)}>
            <button type="button" aria-pressed={selected === tab.id} {...stylex.props(styles.button, selected === tab.id && styles.selected)} onClick={() => setSelected(tab.id)}>{new URL(tab.location).host}</button>
            <button type="button" aria-label={`Close ${new URL(tab.location).host}`} {...stylex.props(styles.button)} onClick={() => {
              const remaining = tabs.filter(item => item.id !== tab.id)
              setTabs(remaining)
              if (selected === tab.id) setSelected(remaining.at(-1)?.id)
              input.current?.focus()
            }}>×</button>
          </div>)}</div>
          {!tabs.length ? <p {...stylex.props(styles.notice)}>Open a website or a local preview beside your conversation.</p> : null}
          {tabs.map(tab => <BrowserTab key={tab.id} id={tab.id} url={tab.url} visible={selected === tab.id} onLocationChange={updateLocation} />)}
        </>}
      </aside>
    </div>
  </div>
}
