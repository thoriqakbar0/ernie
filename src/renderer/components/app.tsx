import { View } from "@zenbujs/core/react"
import { Agentation } from "agentation"
import { SIDEBAR_VIEW_TYPE } from "../../packages/view-types"
import { ChatWorkspace } from "./chat-workspace"
import { Sidebar } from "./sidebar"
import { Titlebar } from "./titlebar"

export function App() {
  const viewType = new URLSearchParams(window.location.search).get("type")

  if (viewType === SIDEBAR_VIEW_TYPE) {
    return <Sidebar />
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Titlebar />
      <main className="grid min-h-0 flex-1 grid-cols-[236px_minmax(0,1fr)]">
        <aside aria-label="Sidebar" className="min-h-0">
          <View type={SIDEBAR_VIEW_TYPE} className="h-full w-full" />
        </aside>
        <ChatWorkspace />
      </main>
      {import.meta.env.DEV ? <Agentation /> : null}
    </div>
  )
}
