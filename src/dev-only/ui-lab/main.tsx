import { createRoot } from "react-dom/client"

import { InvalidScenario } from "./invalid-scenario"
import { parseUiLabRoute } from "./fixtures"
import { UiLab } from "./ui-lab"
import "../../renderer/main.css"

const rootElement = document.getElementById("root")

if (rootElement === null) {
  throw new Error("Missing #root UI lab mount.")
}

const route = parseUiLabRoute(window.location.search)

createRoot(rootElement).render(
  route.tag === "ready"
    ? <UiLab fixture={route.fixture} />
    : <InvalidScenario received={route.received} />,
)
