import * as stylex from "@stylexjs/stylex"
import { styles } from "./chat-workspace.styles"
import { AgentAvatar } from "./agent-avatar"
import type { Agent } from "../../packages/agents"
import { getWorkspaceName } from "./workspace-name"
import { FolderIcon } from "lucide-react"

/** Introduces one Agent and the workspace where its fresh conversation starts. */
export function EmptyConversation({ agent, cwd }: Readonly<{ agent?: Agent; cwd: string }>) {
  return <div {...stylex.props(styles.emptyConversation)}>
    <div {...stylex.props(styles.emptyHeading)}>
      <h1 {...stylex.props(styles.emptyTitle)}>{agent ? <>what’s next,<br/><span {...stylex.props(styles.emptyAgentName)}>{agent.name}?</span></> : <>a fresh page.<br/>what’s next?</>}</h1>
      {agent ? <span {...stylex.props(styles.emptyAvatar)}><AgentAvatar avatar={agent.avatar} size="large"/></span> : null}
    </div>
    {agent?.role ? <p {...stylex.props(styles.emptyRole)}>{agent.role}</p> : null}
    <p title={cwd} {...stylex.props(styles.emptyWorkspace)}><FolderIcon size={14} aria-hidden="true"/>Starts in {getWorkspaceName(cwd)}</p>
  </div>
}
