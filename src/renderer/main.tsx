import { createRoot } from "react-dom/client"
import { ZenbuProvider } from "@zenbujs/core/react"
import { App } from "./components/app"
import "./main.css"

const rootElement = document.getElementById("root")

if (rootElement === null) {
  throw new Error("Missing #root renderer mount.")
}

createRoot(rootElement).render(
  <ZenbuProvider>
    <App />
  </ZenbuProvider>,
)
