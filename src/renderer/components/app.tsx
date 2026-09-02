import { Agentation } from "agentation"
import { View } from "@zenbujs/core/react"
import { SIDEBAR_VIEW_TYPE } from "../../packages/view-types"
import { ChatWorkspace } from "./chat-workspace"
import { Titlebar } from "./titlebar"

export function App() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#ernie-workspace">Skip to workspace</a>
      <Titlebar />
      <main className="app-main">
        <div aria-label="Session navigation" className="app-sidebar-slot">
          <View className="h-full w-full" name={SIDEBAR_VIEW_TYPE} />
        </div>
        <ChatWorkspace />
      </main>
      {import.meta.env.DEV && import.meta.env.VITE_ERNIE_CYPRESS !== "1"
        ? <Agentation endpoint="http://127.0.0.1:4747" />
        : null}
    </div>
  )
}
