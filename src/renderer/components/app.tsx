import { Agentation } from "agentation"
import { View } from "@zenbujs/core/react"
import { SIDEBAR_VIEW_TYPE } from "../../packages/view-types"
import { ChatWorkspace } from "./chat-workspace"
import { Titlebar } from "./titlebar"

export function App() {
  return (
    <div className="flex flex-col min-h-screen">
      <Titlebar />
      <main className="grid min-h-0 flex-1 grid-cols-[236px_minmax(0,1fr)]">
        <aside aria-label="Sidebar" className="min-h-0">
          <View className="h-full w-full" name={SIDEBAR_VIEW_TYPE} />
        </aside>
        <ChatWorkspace />
      </main>
      {import.meta.env.DEV && import.meta.env.VITE_ERNIE_CYPRESS !== "1"
        ? <Agentation endpoint="http://127.0.0.1:4747" />
        : null}
    </div>
  )
}
