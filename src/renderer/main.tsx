import { createRoot } from "react-dom/client"
import { View, ZenbuProvider } from "@zenbujs/core/react"
import { App } from "./components/app"
import { PrimeAgentStateProvider } from "./prime-agent-state"
import "./main.css"

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
const content = route === null ? <App /> : <View name={route} />

createRoot(rootElement).render(
  <ZenbuProvider wsUrl={browserWsUrl}>
    <PrimeAgentStateProvider>
      {content}
    </PrimeAgentStateProvider>
  </ZenbuProvider>,
)
