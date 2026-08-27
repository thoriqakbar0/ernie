import { Agentation } from "agentation"
import { Titlebar } from "./titlebar"
import { Home } from "./home"

/** Composes Ernie's titlebar and initial application content. */
export function App() {
  return (
    <div className="flex flex-col min-h-screen">
      <Titlebar />
      <Home />
      {import.meta.env.DEV ? <Agentation /> : null}
    </div>
  )
}
