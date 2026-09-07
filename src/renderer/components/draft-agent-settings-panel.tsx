import * as stylex from "@stylexjs/stylex"
import { createPortal } from "react-dom"
import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from "react"
import { ChevronDownIcon, XIcon } from "lucide-react"
import type { Agent } from "../../packages/agents"
import { useAppNavigation } from "../app-navigation"
import { useAgentCreation } from "../agent-creation"
import { AgentAvatar } from "./agent-avatar"
import { styles } from "./draft-agent-settings-panel.styles"

function subscribeToWidth(notify: () => void) {
  const query = window.matchMedia("(min-width: 721px)")
  query.addEventListener("change", notify)
  return () => query.removeEventListener("change", notify)
}
function isWide() { return window.matchMedia("(min-width: 721px)").matches }

/** Docks local draft settings beside the composer, falling back inline when navigation is hidden. */
export function DraftAgentSettingsPanel({ name, avatar, open, onOpenChange, disabled, choosingFolder, children, renderComposer }: Readonly<{
  name: string
  avatar: Agent["avatar"]
  open: boolean
  onOpenChange: (open: boolean) => void
  disabled: boolean
  choosingFolder: boolean
  children: ReactNode
  renderComposer: (trigger: ReactNode) => ReactNode
}>) {
  const { draftSettingsHost, draftSettingsDocked, setDraftSettingsDocked } = useAgentCreation()
  const { page } = useAppNavigation()
  const visible = open && page === "conversation"
  const wide = useSyncExternalStore(subscribeToWidth, isWide, () => false)
  const destination = wide ? draftSettingsHost : null
  const trigger = useRef<HTMLButtonElement>(null)
  const content = useRef<HTMLElement>(null)
  const wasOpen = useRef(false)
  const panelId = useId()
  const titleId = useId()
  useEffect(() => {
    setDraftSettingsDocked(visible && destination !== null)
    return () => setDraftSettingsDocked(false)
  }, [visible, destination, setDraftSettingsDocked])
  useEffect(() => {
    if (!visible) { wasOpen.current = false; return }
    if (destination && !draftSettingsDocked) return
    if (!wasOpen.current) content.current?.querySelector<HTMLInputElement>('input[name="agentName"]')?.focus()
    wasOpen.current = true
  }, [visible, destination, draftSettingsDocked])
  const close = () => {
    if (choosingFolder) return
    onOpenChange(false)
    trigger.current?.focus()
  }
  const panel = visible ? <section ref={content} id={panelId} aria-labelledby={titleId} {...stylex.props(styles.panel, !destination && styles.inline)} onKeyDown={(event) => {
    if (event.key === "Escape" && !event.nativeEvent.isComposing) { event.stopPropagation(); close() }
  }}>
    <div {...stylex.props(styles.header)}><h2 id={titleId} {...stylex.props(styles.title)}>Agent settings</h2><button type="button" disabled={choosingFolder} onClick={close} aria-label="Close Agent settings" {...stylex.props(styles.close)}><XIcon size={16}/></button></div>
    {children}
  </section> : null
  const control = <button ref={trigger} type="button" disabled={disabled} aria-label={`Settings for ${name || "new Agent"}`} aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => open ? close() : onOpenChange(true)} {...stylex.props(styles.chip)}>
      <AgentAvatar avatar={avatar} size="small"/><span {...stylex.props(styles.name)}>{name || "Your Agent"}</span><ChevronDownIcon size={14}/>
    </button>
  return <>
    {renderComposer(control)}
    {destination ? createPortal(panel, destination) : panel}
  </>
}
