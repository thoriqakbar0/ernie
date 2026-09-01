import { Agentation } from "agentation"
import { View } from "@zenbujs/core/react"
import { SIDEBAR_VIEW_TYPE } from "../../packages/view-types"
import { ChatWorkspace } from "./chat-workspace"
import { Titlebar } from "./titlebar"

export function App() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
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
