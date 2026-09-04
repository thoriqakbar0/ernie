import { styles as sharedStyles } from "../component-styles"
import { styles } from "./app.styles"
import * as stylex from "@stylexjs/stylex"
import { useState } from "react"
import { View } from "@zenbujs/core/react"
import { PanelLeftOpenIcon } from "lucide-react"
import { SIDEBAR_VIEW_TYPE } from "../../packages/view-types"
import { ChatWorkspace } from "./chat-workspace"

// @lat: [[product#Product contract#Responsive workspace]]
export function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  return (
    <div {...stylex.props(styles.appShell)}>
      <a href="#ernie-workspace" {...stylex.props(styles.skipLink)}>
        Skip to workspace
      </a>
      <main {...stylex.props(styles.appMain, !sidebarOpen && styles.appMainSidebarClosed)}>
        {sidebarOpen ? (
          <div aria-label="Session navigation" {...stylex.props(styles.appSidebarSlot)}>
            <View
              args={{
                onClose: () => setSidebarOpen(false),
              }}
              name={SIDEBAR_VIEW_TYPE}
              {...stylex.props(styles.viewFill)}
            />
          </div>
        ) : (
          <button
            aria-controls="ernie-sidebar"
            aria-expanded="false"
            aria-label="Open sidebar"
            onClick={() => setSidebarOpen(true)}
            type="button"
            {...stylex.props(styles.sidebarOpenButton)}
          >
            <PanelLeftOpenIcon {...stylex.props(sharedStyles.controlIcon, styles.openIcon)} />
          </button>
        )}
        <ChatWorkspace />
      </main>
    </div>
  )
}
