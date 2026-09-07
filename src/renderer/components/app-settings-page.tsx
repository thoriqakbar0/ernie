import { useEffect, useState, lazy, Suspense } from "react"
import { useRpc } from "@zenbujs/core/react"
import { Schema } from "effect"
import { ArrowLeftIcon, ChevronRightIcon, PaintbrushIcon } from "lucide-react"
import * as stylex from "@stylexjs/stylex"
import { HistoryResponse } from "../../packages/app-history"
import { useAgentCreation } from "../agent-creation"
import { useSetConversationDraft } from "../agent-state"
import { useAppNavigation } from "../app-navigation"
import { AppHistoryPage } from "./app-history-page"
import { AgentAvatar } from "./agent-avatar"
import { styles } from "./app-settings.styles"

const HistoryPreview = import.meta.env.DEV ? lazy(() => import("../../dev-only/history-scenarios")) : undefined
const suggestions = ["Make the interface calmer", "Change the colors", "Make the sidebar more compact"]
type Availability = "checking" | "ready" | "desktop" | "unavailable"
/** Application settings lead with customization, with recovery beside that decision. */
export function AppSettingsPage() {
  const rpc = useRpc()
  const { navigate, page } = useAppNavigation()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const [availability, setAvailability] = useState<Availability>("checking")
  const { setAdding } = useAgentCreation()
  const setDraft = useSetConversationDraft()
  useEffect(() => {
    let active = true
    void (async () => {
      const response = Schema.decodeUnknownSync(HistoryResponse)(await rpc.app.appHistory.request({ method: "history.status" }))
      if (!active) return
      if (!response.ok) {
        setAvailability(response.error.code === "unsupported_workspace" ? "desktop" : "unavailable")
        return
      }
      const status = Schema.decodeUnknownSync(Schema.Struct({ recoveryAvailable: Schema.Boolean, unsavedChanges: Schema.NullOr(Schema.Boolean), captureError: Schema.NullOr(Schema.Struct({ message: Schema.String })) }))(response.value)
      setAvailability(status.recoveryAvailable && !status.captureError ? "ready" : "unavailable")

    })().catch(() => { if (active) { setAvailability("unavailable") } })
    return () => { active = false }
  }, [rpc])
  async function customize(prompt?: string) {
    setPending(true); setError(undefined)
    try {
      const result = await rpc.app.appHistory.customize()
      if (!result.ok) { setError(result.error); return }
      if (prompt) {
        const roster = await rpc.app.agents.getRoster()
        if (!roster.ok) { setError(roster.error); return }
        const agent = roster.value.agents.find(item => item.id === roster.value.selectedAgentId)
        if (!agent?.root) { setError("The customization conversation isn’t ready. Try again."); return }
        setDraft(agent.root.sessionId, prompt)
      }
      setAdding(false); navigate("conversation")
    } catch { setError("Couldn’t open customization. Try again when Ernie reconnects.") }
    finally { setPending(false) }
  }
  const enabled = availability === "ready" && !pending
  return <section aria-label="Settings" {...stylex.props(styles.page)}><div {...stylex.props(styles.content)}>
    <header {...stylex.props(styles.header)}><button type="button" aria-label="Back to conversation" onClick={() => navigate("conversation")} {...stylex.props(styles.button)}><ArrowLeftIcon size={18}/></button><h1 {...stylex.props(styles.title)}>Settings</h1></header>
    <div role="tablist" aria-label="Settings sections" {...stylex.props(styles.tabs)}>{(["settings", "history"] as const).map((value, index) => <button key={value} id={`settings-${value}-tab`} type="button" role="tab" aria-selected={page === value} aria-controls="settings-panel" tabIndex={page === value ? 0 : -1} onClick={() => navigate(value)} onKeyDown={event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return
      event.preventDefault()
      const next = event.key === "Home" ? "settings" : event.key === "End" ? "history" : index === 0 ? "history" : "settings"
      navigate(next)
      document.getElementById(`settings-${next}-tab`)?.focus()
    }} {...stylex.props(styles.button, page === value && styles.selectedTab)}>{value === "settings" ? "Customize" : "App history"}</button>)}</div>
    <div role="tabpanel" id="settings-panel" aria-labelledby={`settings-${page}-tab`}>
    {page === "history" ? availability === "desktop" && HistoryPreview ? <Suspense fallback={<p>Loading example history…</p>}><HistoryPreview/></Suspense> : availability === "checking" ? <p role="status">Checking app history…</p> : <AppHistoryPage embedded/> : <>
    <section aria-labelledby="customize-heading" {...stylex.props(styles.customizeCard)}>
      <div aria-hidden="true" {...stylex.props(styles.art)}><AgentAvatar avatar="iris" size="large"/><PaintbrushIcon size={30} {...stylex.props(styles.brush)}/></div>
      <h2 id="customize-heading" {...stylex.props(styles.heroTitle)}>Make Ernie yours.</h2>
      <p {...stylex.props(styles.heroDescription)}>A little calmer? A different color? Tell Ernie what you’d like to change.</p>
      <button type="button" disabled={!enabled} onClick={() => void customize()} {...stylex.props(styles.button, styles.primary)}>{pending ? "Opening…" : "Customize Ernie"}<ChevronRightIcon size={18} aria-hidden="true"/></button>
      <p role="status" {...stylex.props(styles.description)}>{availability === "desktop" ? "Customization is available in the desktop app." : availability === "checking" ? "Checking app history…" : availability === "unavailable" ? "App history needs attention before you can customize." : "Start a conversation. Review your idea before sending."}</p>
      {availability === "ready" ? <div {...stylex.props(styles.suggestions)}>{suggestions.map(prompt => <button key={prompt} type="button" disabled={pending} onClick={() => void customize(prompt)} {...stylex.props(styles.button, styles.suggestion)}>{prompt}</button>)}</div> : null}
    </section>
    <p {...stylex.props(styles.description)}>Saved app changes stay on this device. Restoring keeps your conversations and Agents.</p>

    {error ? <p role="alert" {...stylex.props(styles.description)}>{error}</p> : null}
    </>}</div>
  </div></section>
}
