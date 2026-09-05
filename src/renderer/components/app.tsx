import { styles as sharedStyles } from "../component-styles"
import { styles } from "./app.styles"
import * as stylex from "@stylexjs/stylex"
import { useState } from "react"
import { View } from "@zenbujs/core/react"
import { PanelLeftOpenIcon } from "lucide-react"
import { SIDEBAR_VIEW_TYPE } from "../../packages/view-types"
import type { Roster } from "../../packages/agents"
import { AgentStateProvider, ConversationDraftProvider, type AgentClient } from "../agent-state"
import { ConversationFlowProvider } from "../conversation-flow"
import { MessageReadingProvider } from "./ui/message-scroller"
import { ChatWorkspace } from "./chat-workspace"

// @lat: [[product#Product contract#Responsive workspace]]
export function App({ roster, agentClient }: { roster?: Roster; agentClient?: AgentClient } = {}) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  return (
    <AgentStateProvider roster={roster} client={agentClient}><ConversationDraftProvider><ConversationFlowProvider><MessageReadingProvider><div {...stylex.props(styles.appShell)}>
      <a href="#ernie-workspace" {...stylex.props(styles.skipLink)}>
        Skip to workspace
      </a>
      <main {...stylex.props(styles.appMain, !sidebarOpen && styles.appMainSidebarClosed)}>
        {sidebarOpen ? (
          <div aria-label="Agent navigation" {...stylex.props(styles.appSidebarSlot)}>
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
        <div {...stylex.props(styles.workspaceSlot, sidebarOpen && styles.workspaceBehindSidebar)}><ChatWorkspace /></div>
      </main>
    </div></MessageReadingProvider></ConversationFlowProvider></ConversationDraftProvider></AgentStateProvider>
  )
}
