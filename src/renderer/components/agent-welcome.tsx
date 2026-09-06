import * as stylex from "@stylexjs/stylex"
import { useState } from "react"
import { ArrowUpRightIcon } from "lucide-react"
import { useAgents } from "../agent-state"
import { AgentAvatar } from "./agent-avatar"
import { AgentSettingsDialog } from "./agent-settings"
import { styles } from "./agent-welcome.styles"

/** Gives the unselected workspace a direct path into the persisted Agent roster. */
export function AgentWelcome() {
  const { roster } = useAgents()
  const [adding, setAdding] = useState(false)
  return <div {...stylex.props(styles.welcome)}>
    <div {...stylex.props(styles.content)}>
      <h1 {...stylex.props(styles.title)}>your next idea,<br/><span {...stylex.props(styles.emphasis)}>meet your Agent.</span></h1>
      <div aria-hidden="true" {...stylex.props(styles.characters)}>
        <span {...stylex.props(styles.character, styles.robot)}><AgentAvatar avatar="fern" size="large"/></span>
        <span {...stylex.props(styles.character, styles.eyes)}><AgentAvatar avatar="tide" size="large"/></span>
        <span {...stylex.props(styles.character, styles.coffee)}><AgentAvatar avatar="ember" size="large"/></span>
        <span {...stylex.props(styles.character, styles.star)}><AgentAvatar avatar="iris" size="large"/></span>
      </div>
      <p {...stylex.props(styles.description)}>{roster.agents.length
        ? "Pick an Agent to continue your work, or give a new one a role of its own."
        : "A name, a role, a place to work. Make an Agent yours, then start with a conversation."}</p>
      <button type="button" onClick={() => setAdding(true)} {...stylex.props(styles.action)}>
        {roster.agents.length ? "Add an Agent" : "Create your first Agent"}<ArrowUpRightIcon size={18}/>
      </button>
      <p {...stylex.props(styles.note)}>Your Agents stay. Each conversation gets its own space.</p>
    </div>
    {adding ? <AgentSettingsDialog onClose={() => setAdding(false)}/> : null}
  </div>
}
