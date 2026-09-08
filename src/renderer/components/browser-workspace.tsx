import { useAgents } from "../agent-state"
import { usePrimeSessionSelection } from "../prime-agent-state"
import { useAppNavigation } from "../app-navigation"
import { useAgentCreation } from "../agent-creation"
import { BrowserControlsContext } from "../browser-controls"
import { Tooltip } from "@base-ui/react/tooltip"
import { Globe2Icon, PanelRightCloseIcon, PlusIcon, XIcon } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import * as stylex from "@stylexjs/stylex"
import { BrowserButton } from "./browser-button"
import { BrowserTab } from "./browser-tab"
import { styles } from "./browser.styles"

interface Tab {
  id: string
  location: string
  title: string
}

type BrowserSession = { open: boolean; tabs: Tab[]; selected?: string }
const emptyBrowser: BrowserSession = { open: false, tabs: [] }

/** Keeps browser tabs alive beside the workspace until explicitly closed. */
export const BrowserWorkspace = ({ children }: { children: ReactNode }) => {
  const { roster } = useAgents()
  const { selectedSessionId } = usePrimeSessionSelection()
  const { childChat } = useAppNavigation()
  const { adding } = useAgentCreation()
  const parentSession = childChat?.parentId ?? selectedSessionId
  const owner = adding ? undefined : roster.agents.find((agent) => agent.root?.sessionId === parentSession)?.id
    ?? (adding ? undefined : roster.selectedAgentId)
  const [browsers, setBrowsers] = useState<Record<string, BrowserSession>>({})
  const { open, tabs, selected } = owner ? browsers[owner] ?? emptyBrowser : emptyBrowser
  const update = (change: (current: BrowserSession) => BrowserSession) => {
    if (!owner) return
    setBrowsers((current) => ({ ...current, [owner]: change(current[owner] ?? emptyBrowser) }))
  }
  const setOpen = (value: boolean) => update((current) => ({ ...current, open: value }))
  const setSelected = (value: string | undefined) => update((current) => ({ ...current, selected: value }))
  const setTabs = (value: Tab[] | ((current: Tab[]) => Tab[])) =>
    update((current) => ({ ...current, tabs: typeof value === "function" ? value(current.tabs) : value }))
  useEffect(() => {
    const refresh = (event: Event) => {
      if (!open) {
        window.location.reload()
        return
      }
      window.dispatchEvent(new CustomEvent("ernie:refresh-browser", {
        detail: event instanceof CustomEvent ? event.detail : undefined,
      }))
    }
    window.addEventListener("ernie:refresh", refresh)
    return () => window.removeEventListener("ernie:refresh", refresh)
  }, [open])
  const opener = useRef<HTMLButtonElement>(null)
  const tabStrip = useRef<HTMLDivElement>(null)
  const restoreOpener = useRef(false)
  useEffect(() => {
    if (!open && restoreOpener.current) {
      const target =
        opener.current?.isConnected && opener.current.getClientRects().length
          ? opener.current
          : [
              ...document.querySelectorAll<HTMLButtonElement>('[aria-controls="ernie-browser"]'),
            ].find((element) => element.getClientRects().length)
      ;(target ?? document.querySelector<HTMLElement>("#ernie-main-content"))?.focus()
      restoreOpener.current = false
    }
  }, [open])
  useEffect(() => {
    const strip = tabStrip.current
    if (!strip) {
      return
    }
    const revealSelectedTab = () =>
      strip
        .querySelector(`#browser-tab-${selected}`)
        ?.scrollIntoView({ block: "nearest", inline: "nearest" })
    const observer = new ResizeObserver(() => revealSelectedTab())
    observer.observe(strip)
    revealSelectedTab()
    return () => observer.disconnect()
  }, [selected])
  const updatePage = useCallback((id: string, location: string, title: string) => {
    setBrowsers((current) => Object.fromEntries(Object.entries(current).map(([key, browser]) => [
      key, { ...browser, tabs: browser.tabs.map((tab) => tab.id === id ? { ...tab, location, title } : tab) },
    ])))
  }, [])
  const addTab = () => {
    const id = crypto.randomUUID()
    setTabs((current) => [...current, { id, location: "", title: "New tab" }])
    setSelected(id)
  }
  const closePanel = () => {
    restoreOpener.current = true
    setOpen(false)
  }
  const closeTab = (id: string) => {
    const index = tabs.findIndex((tab) => tab.id === id)
    const remaining = tabs.filter((tab) => tab.id !== id)
    setTabs(remaining)
    if (remaining.length === 0) {
      setSelected(undefined)
      closePanel()
      return
    }
    const next = selected === id ? (remaining[index] ?? remaining.at(-1))?.id : selected
    setSelected(next)
    requestAnimationFrame(() =>
      document.querySelector<HTMLButtonElement>(`#browser-tab-${next}`)?.focus(),
    )
  }

  const toggle = (trigger: HTMLButtonElement) => {
    if (!owner) return
    opener.current = trigger
    if (open) {
      closePanel()
      return
    }
    if (!tabs.length) {
      addTab()
    }
    setOpen(true)
    if (selected) {
      requestAnimationFrame(() =>
        document.querySelector<HTMLButtonElement>(`#browser-tab-${selected}`)?.focus(),
      )
    }
  }
  return (
    <BrowserControlsContext value={{ open, toggle }}>
      <Tooltip.Provider>
        <div {...stylex.props(styles.workspace)}>
          <div {...stylex.props(styles.split, open && styles.splitOpen)}>
            <div {...stylex.props(styles.conversation)}>{children}</div>
            <aside
              id="ernie-browser"
              aria-label="Browser"
              hidden={!open}
              {...stylex.props(styles.panel, !open && styles.hidden)}
            >
              <div {...stylex.props(styles.panelHeader)}>
                <div
                  ref={tabStrip}
                  role="tablist"
                  aria-label="Browser tabs"
                  {...stylex.props(styles.tabs)}
                >
                  {tabs.map((tab, index) => (
                    <div
                      key={tab.id}
                      role="presentation"
                      {...stylex.props(styles.tab, selected === tab.id && styles.selected)}
                    >
                      <Tooltip.Root>
                        <Tooltip.Trigger
                          id={`browser-tab-${tab.id}`}
                          type="button"
                          role="tab"
                          aria-selected={selected === tab.id}
                          aria-controls={`browser-page-${tab.id}`}
                          tabIndex={selected === tab.id ? 0 : -1}
                          {...stylex.props(styles.button, styles.tabButton)}
                          onClick={() => setSelected(tab.id)}
                          onKeyDown={(event) => {
                            const last = tabs.length - 1
                            const positions: Record<string, number> = {
                              ArrowLeft: (index + last) % tabs.length,
                              ArrowRight: (index + 1) % tabs.length,
                              End: last,
                              Home: 0,
                            }
                            const position = positions[event.key]
                            if (position !== undefined) {
                              event.preventDefault()
                              const next = tabs[position]
                              if (next) {
                                setSelected(next.id)
                                document
                                  .querySelector<HTMLButtonElement>(`#browser-tab-${next.id}`)
                                  ?.focus()
                              }
                            }
                            if (event.key === "Delete") {
                              event.preventDefault()
                              closeTab(tab.id)
                            }
                          }}
                        >
                          <Globe2Icon
                            size={13}
                            aria-hidden="true"
                            {...stylex.props(styles.tabIcon)}
                          />
                          <span {...stylex.props(styles.tabTitle)}>{tab.title}</span>
                        </Tooltip.Trigger>
                        <Tooltip.Portal>
                          <Tooltip.Positioner
                            side="bottom"
                            sideOffset={6}
                            {...stylex.props(styles.tooltipPositioner)}
                          >
                            <Tooltip.Popup {...stylex.props(styles.tooltip)}>
                              {tab.title}
                              {tab.location ? <div>{tab.location}</div> : null}
                            </Tooltip.Popup>
                          </Tooltip.Positioner>
                        </Tooltip.Portal>
                      </Tooltip.Root>
                      <BrowserButton
                        label={`Close ${tab.title}`}
                        icon={XIcon}
                        onClick={() => closeTab(tab.id)}
                      />
                    </div>
                  ))}
                </div>
                <BrowserButton label="New tab" icon={PlusIcon} onClick={addTab} />
                <BrowserButton
                  label="Hide browser"
                  icon={PanelRightCloseIcon}
                  onClick={closePanel}
                />
              </div>
              {Object.values(browsers).flatMap((browser) => browser.tabs).map((tab) => (
                <BrowserTab
                  key={tab.id}
                  id={tab.id}
                  visible={open && selected === tab.id}
                  onPageChange={updatePage}
                />
              ))}
            </aside>
          </div>
        </div>
      </Tooltip.Provider>
    </BrowserControlsContext>
  )
}
