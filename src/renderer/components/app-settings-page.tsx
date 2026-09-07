import { lazy, Suspense } from "react"
import { Tabs } from "@base-ui/react/tabs"
import { ArrowLeftIcon } from "lucide-react"
import * as stylex from "@stylexjs/stylex"
import { useAppNavigation } from "../app-navigation"
import { AppHistoryPage } from "./app-history-page"
import { AnimatedTabs } from "./ui/animated-tabs"
import { AppearanceSettings } from "./appearance-settings"
import { styles } from "./app-settings.styles"

const HistoryPreview =
  import.meta.env.DEV && new URLSearchParams(window.location.search).get("scenario") === "history"
    ? lazy(() => import("../../dev-only/history-scenarios"))
    : undefined
/** Application settings expose appearance preferences and application history. */
export const AppSettingsPage = () => {
  const { navigate, page } = useAppNavigation()
  let historyContent = <AppHistoryPage embedded />
  if (HistoryPreview) {
    historyContent = (
      <Suspense fallback={<p>Loading example history…</p>}>
        <HistoryPreview />
      </Suspense>
    )
  }
  return (
    <section
      data-ernie-page={page}
      aria-label={page === "history" ? "App history settings" : "Appearance settings"}
      {...stylex.props(styles.page)}
    >
      <div {...stylex.props(styles.content)}>
        <header {...stylex.props(styles.header)}>
          <button
            type="button"
            aria-label="Back to conversation"
            onClick={() => navigate("conversation")}
            {...stylex.props(styles.button)}
          >
            <ArrowLeftIcon size={18} />
          </button>
          <h1 {...stylex.props(styles.title)}>Settings</h1>
        </header>
        <AnimatedTabs
          shape="rounded"
          label="Settings sections"
          tabs={[
            { label: "Appearance", value: "settings" },
            { label: "App history", value: "history" },
          ]}
          value={page}
          onValueChange={(value) => {
            if (value === "settings" || value === "history") {
              navigate(value)
            }
          }}
        >
          <Tabs.Panel value="settings" {...stylex.props(styles.panel)}>
            <AppearanceSettings />
          </Tabs.Panel>
          <Tabs.Panel value="history" {...stylex.props(styles.panel)}>
            {historyContent}
          </Tabs.Panel>
        </AnimatedTabs>
      </div>
    </section>
  )
}
