import * as stylex from "@stylexjs/stylex"
import { styles } from "./chat-workspace.styles"
import { AgentAvatar } from "./agent-avatar"
import type { Agent } from "../../packages/agents"
import { getWorkspaceName } from "./workspace-name"

/** Introduces one Agent and the workspace where its fresh conversation starts. */
export function EmptyConversation({ agent }: { agent?: Agent }) {
  return <div {...stylex.props(styles.emptyConversation)}>
    {agent ? <AgentAvatar avatar={agent.avatar} size="large"/> : null}
    <h1 {...stylex.props(styles.emptyTitle)}>{agent ? `What should ${agent.name} work on?` : "Start a conversation"}</h1>
    {agent?.role ? <p {...stylex.props(styles.emptyRole)}>{agent.role}</p> : null}
    {agent ? <p {...stylex.props(styles.emptyWorkspace)}>Starts in {getWorkspaceName(agent.cwd)}</p> : null}
  </div>
}
