import { useEffect, useState, lazy, Suspense } from "react"
import { Tabs } from "@base-ui/react/tabs"
import { useRpc } from "@zenbujs/core/react"
import { Schema } from "effect"
import { ArrowLeftIcon } from "lucide-react"
import * as stylex from "@stylexjs/stylex"
import { HistoryResponse } from "../../packages/app-history"
import { useAppNavigation } from "../app-navigation"
import { AppHistoryPage } from "./app-history-page"
import { AnimatedTabs } from "./ui/animated-tabs"
import { AppCustomizationEntry } from "./app-customization-entry"
import { AppearanceSettings } from "./appearance-settings"
import { styles } from "./app-settings.styles"

const HistoryPreview = import.meta.env.DEV ? lazy(() => import("../../dev-only/history-scenarios")) : undefined
type Availability = "checking" | "ready" | "desktop" | "unavailable"
/** Application settings expose appearance preferences and application history. */
export function AppSettingsPage() {
  const rpc = useRpc()
  const { navigate, page } = useAppNavigation()
  const [availability, setAvailability] = useState<Availability>("checking")
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
  return <section data-ernie-page={page} aria-label={page === "history" ? "App history settings" : "Appearance settings"} {...stylex.props(styles.page)}><div {...stylex.props(styles.content)}>
    <header {...stylex.props(styles.header)}><button type="button" aria-label="Back to conversation" onClick={() => navigate("conversation")} {...stylex.props(styles.button)}><ArrowLeftIcon size={18}/></button><h1 {...stylex.props(styles.title)}>Settings</h1></header>
    <AnimatedTabs shape="rounded" label="Settings sections" tabs={[{ label: "Appearance", value: "settings" }, { label: "App history", value: "history" }]} value={page} onValueChange={value => { if (value === "settings" || value === "history") navigate(value) }}>
      <Tabs.Panel value="settings"><AppearanceSettings/><AppCustomizationEntry availability={availability}/></Tabs.Panel>
      <Tabs.Panel value="history">
        {availability === "desktop" && HistoryPreview ? <Suspense fallback={<p>Loading example history…</p>}><HistoryPreview/></Suspense> : availability === "checking" ? <p role="status">Checking app history…</p> : <AppHistoryPage embedded/>}
      </Tabs.Panel>
    </AnimatedTabs>
  </div></section>
}
