import * as stylex from "@stylexjs/stylex"
import { useAgentCreation } from "../agent-creation"
import { GeneratedCharacter } from "./generated-avatar"
import { AgentSettingsDialog } from "./agent-settings"
import { styles } from "./agent-welcome.styles"

/** Opens first-message composition without creating a native Agent on mount. */
export const AgentWelcome = () => {
  const { setAdding } = useAgentCreation()
  return (
    <div {...stylex.props(styles.welcome)}>
      <div {...stylex.props(styles.content)}>
        <div aria-hidden="true" {...stylex.props(styles.characters)}>
          {[17, 42, 108, 256].map((seed) => (
            <span key={seed} {...stylex.props(styles.character)}>
              <GeneratedCharacter seed={seed} animated={false} />
            </span>
          ))}
        </div>
        <h1 {...stylex.props(styles.title)}>What shall we make?</h1>
        <AgentSettingsDialog onClose={() => setAdding(false)} />
      </div>
    </div>
  )
}
