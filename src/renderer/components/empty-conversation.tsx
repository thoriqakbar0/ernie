import * as stylex from "@stylexjs/stylex"
import { styles } from "./chat-workspace.styles"
import { AgentAvatar } from "./agent-avatar"
import type { Agent } from "../../packages/agents"
import { getWorkspaceName } from "./workspace-name"
import { ChevronDownIcon, FolderIcon } from "lucide-react"

/** Introduces one Agent and the workspace where its fresh conversation starts. */
export function EmptyConversation({ agent, cwd }: Readonly<{ agent?: Agent; cwd: string }>) {
  return <div {...stylex.props(styles.emptyConversation)}>
    <div {...stylex.props(styles.emptyHeading)}>
      <h1 {...stylex.props(styles.emptyTitle)}>what’s next?</h1>
      {agent ? <span {...stylex.props(styles.emptyAvatar)}><AgentAvatar avatar={agent.avatar} size="large" animated/></span> : null}
    </div>
    <details {...stylex.props(styles.workspaceDetails)}><summary {...stylex.props(styles.emptyWorkspace)}><FolderIcon size={14} aria-hidden="true"/><span>Working folder: {getWorkspaceName(cwd)}</span><ChevronDownIcon size={14} aria-hidden="true"/></summary><p {...stylex.props(styles.workspacePath)}>{cwd || "No working folder selected"}</p></details>
  </div>
}
