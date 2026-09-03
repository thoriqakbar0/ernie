import { useState } from "react"
import { View } from "@zenbujs/core/react"
import { PanelLeftOpenIcon } from "lucide-react"
import { SIDEBAR_VIEW_TYPE } from "../../packages/view-types"
import { ChatWorkspace } from "./chat-workspace"

// @lat: [[product#Product contract#Responsive workspace]]
export function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <div className="app-shell">
      <a className="skip-link" href="#ernie-workspace">Skip to workspace</a>
      <main className={sidebarOpen ? "app-main" : "app-main app-main--sidebar-closed"}>
        {sidebarOpen ? (
          <div aria-label="Session navigation" className="app-sidebar-slot">
            <View
              args={{ onClose: () => setSidebarOpen(false) }}
              className="h-full w-full"
              name={SIDEBAR_VIEW_TYPE}
            />
          </div>
        ) : (
          <button
            aria-controls="ernie-sidebar"
            aria-expanded="false"
            aria-label="Open sidebar"
            className="sidebar-open-button"
            onClick={() => setSidebarOpen(true)}
            type="button"
          >
            <PanelLeftOpenIcon />
          </button>
        )}
        <ChatWorkspace />
      </main>
    </div>
  )
}
