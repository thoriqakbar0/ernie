import { lazy, Suspense } from "react"
import { InterfaceKit } from "interface-kit/react"
import { createRoot } from "react-dom/client"
import { View, ZenbuProvider } from "@zenbujs/core/react"
import { App } from "./components/app"
import { PrimeAgentStateProvider } from "./prime-agent-state"
import "./main.css"
import { UpdateNotice } from "./components/update-notice"

import { applyTypography, readTypography } from "./typography"
import { applyAppearance, readAppearance, applyPalette, readPalette } from "./appearance"

applyTypography(readTypography())
applyAppearance(readAppearance())
applyPalette(readPalette())

const rootElement = document.getElementById("root")

if (rootElement === null) {
  throw new Error("Missing #root renderer mount.")
}

const search = new URLSearchParams(window.location.search)
const route = search.get("route")
const browserDevelopment = search.get("browser") === "1"
const browserWsUrl = browserDevelopment
  ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`
  : undefined
const AgentScenarios = import.meta.env.DEV && search.get("scenario") === "agents"
  ? lazy(() => import("../dev-only/agent-roster-scenarios"))
  : undefined
const WorkspaceScenarios = import.meta.env.DEV && search.get("scenario") === "workspaces"
  ? lazy(() => import("../dev-only/workspace-picker-scenarios"))
  : undefined
// Old preview links now open history within the normal settings shell.
if (import.meta.env.DEV && search.get("scenario") === "history") {
  const url = new URL(window.location.href)
  url.searchParams.delete("scenario")
  url.searchParams.set("page", "history")
  window.history.replaceState(null, "", url)
}
const UpdateScenario = import.meta.env.DEV && search.get("scenario") === "updates"
  ? lazy(() => import("../dev-only/update-scenario"))
  : undefined
const content = route === null ? <App updates={!browserDevelopment ? <UpdateNotice /> : null} /> : <View name={route} />

createRoot(rootElement).render(
  <>
  {UpdateScenario ? <Suspense fallback={<p>Loading update scenario…</p>}><UpdateScenario /></Suspense> : <ZenbuProvider wsUrl={browserWsUrl}>
    {WorkspaceScenarios ? <Suspense fallback={<p>Loading development scenario…</p>}><WorkspaceScenarios/></Suspense> : AgentScenarios ? <Suspense fallback={<p>Loading development scenario…</p>}><AgentScenarios/></Suspense> : <PrimeAgentStateProvider>
      {content}
    </PrimeAgentStateProvider>}
  </ZenbuProvider>}
  {import.meta.env.DEV ? <InterfaceKit /> : null}
  </>,
)
