import { createRoot } from "react-dom/client"
import { ZenbuProvider } from "@zenbujs/core/react"
import { SIDEBAR_VIEW_TYPE } from "../packages/view-types"
import { App } from "./components/app"
import { Sidebar } from "./components/sidebar"
import { PrimeAgentStateProvider } from "./prime-agent-state"
import "./main.css"

const rootElement = document.getElementById("root")

if (rootElement === null) {
  throw new Error("Missing #root renderer mount.")
}

const viewType = new URLSearchParams(window.location.search).get("type")
const content = viewType === SIDEBAR_VIEW_TYPE ? <Sidebar /> : <App />

createRoot(rootElement).render(
  <ZenbuProvider>
    <PrimeAgentStateProvider>
      {content}
    </PrimeAgentStateProvider>
  </ZenbuProvider>,
)
