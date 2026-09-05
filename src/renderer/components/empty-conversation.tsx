import * as stylex from "@stylexjs/stylex"
import { styles } from "./chat-workspace.styles"
import { AgentAvatar } from "./agent-avatar"
import type { Agent } from "../../packages/agents"

/** Explains the Agent and fresh context without moving the bottom composer. */
export function EmptyConversation({ agent }: { agent?: Agent }) {
  return <div {...stylex.props(styles.emptyConversation)}>
    {agent ? <AgentAvatar avatar={agent.avatar}/> : null}
    <h1 {...stylex.props(styles.emptyTitle)}>{agent ? `Message ${agent.name}` : "Start a conversation"}</h1>
    {agent?.role ? <p {...stylex.props(styles.emptyRole)}>{agent.role}</p> : null}
    <p {...stylex.props(styles.emptyNote)}>Ask a question or give your Agent something to work on.</p>
    <p {...stylex.props(styles.emptyNote)}>{agent ? "This conversation starts with your Agent’s instructions and workspace." : "Messages stay in this conversation."}</p>
  </div>
}
