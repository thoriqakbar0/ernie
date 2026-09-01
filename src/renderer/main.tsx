import { createRoot } from "react-dom/client"
import { View, ZenbuProvider } from "@zenbujs/core/react"
import { App } from "./components/app"
import { PrimeAgentStateProvider } from "./prime-agent-state"
import "./main.css"

const rootElement = document.getElementById("root")

if (rootElement === null) {
  throw new Error("Missing #root renderer mount.")
}

const route = new URLSearchParams(window.location.search).get("route")
const content = route === null ? <App /> : <View name={route} />

createRoot(rootElement).render(
  <ZenbuProvider>
    <PrimeAgentStateProvider>
      {content}
    </PrimeAgentStateProvider>
  </ZenbuProvider>,
)
