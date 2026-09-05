import { lazy, Suspense } from "react"
import { createRoot } from "react-dom/client"
import { View, ZenbuProvider } from "@zenbujs/core/react"
import { App } from "./components/app"
import { PrimeAgentStateProvider } from "./prime-agent-state"
import "./main.css"

if (import.meta.env.DEV && import.meta.env.VITE_ERNIE_CYPRESS !== "1") {
  void import("react-grab").catch(() => {
    console.error("Failed to load React Grab")
  })
}

const Agentation = import.meta.env.DEV && import.meta.env.VITE_ERNIE_CYPRESS !== "1"
  ? lazy(async () => {
      const module = await import("agentation")
      return { default: module.Agentation }
    })
  : undefined

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
const content = route === null ? <App /> : <View name={route} />

createRoot(rootElement).render(
  <ZenbuProvider wsUrl={browserWsUrl}>
    {WorkspaceScenarios ? <Suspense fallback={<p>Loading development scenario…</p>}><WorkspaceScenarios/></Suspense> : AgentScenarios ? <Suspense fallback={<p>Loading development scenario…</p>}><AgentScenarios/></Suspense> : <PrimeAgentStateProvider>
      {content}
      {Agentation ? <Suspense fallback={null}><Agentation /></Suspense> : null}
    </PrimeAgentStateProvider>}
  </ZenbuProvider>,
)
