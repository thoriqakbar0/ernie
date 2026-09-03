import { View } from "@zenbujs/core/react"
import { SIDEBAR_VIEW_TYPE } from "../../packages/view-types"
import { ChatWorkspace } from "./chat-workspace"

// @lat: [[product#Product contract#Responsive workspace]]
export function App() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#ernie-workspace">Skip to workspace</a>
      <main className="app-main">
        <div aria-label="Session navigation" className="app-sidebar-slot">
          <View className="h-full w-full" name={SIDEBAR_VIEW_TYPE} />
        </div>
        <ChatWorkspace />
      </main>
    </div>
  )
}
