import { useRef } from "react"
import { isAgentationInteraction } from "../agentation-interaction"
import { Popover } from "@base-ui/react/popover"
import { SettingsIcon } from "lucide-react"
import * as stylex from "@stylexjs/stylex"
import type { Agent } from "../../packages/agents"
import { useAgentCreation } from "../agent-creation"
import { AgentControls } from "./agent-settings"
import { styles as rosterStyles } from "./agent-roster.styles"

const styles = stylex.create({
  positioner: { zIndex: 100, maxWidth: "calc(100vw - 24px)" },
  popup: {
    backgroundColor: "var(--surface)",
    borderColor: "var(--rule)",
    borderStyle: "solid",
    borderWidth: 1,
    borderRadius: 12,
    boxShadow: "0 8px 32px rgb(0 0 0 / .16)",
    width: "min(420px, calc(100vw - 24px))",
    maxHeight: "var(--available-height)",
    overflowY: "auto",
    padding: 12,
  },
})

/** Places the existing agent settings form below its header control. */
export const AgentSettingsPopover = ({ agent }: { agent: Agent }) => {
  const { editing, setEditing } = useAgentCreation()
  const popupRef = useRef<HTMLDivElement>(null)
  return (
    <Popover.Root
      open={editing?.agentId === agent.id}
      onOpenChange={(open, details) => {
        if (!open && isAgentationInteraction(details.event)) {
          details.cancel()
          return
        }
        setEditing(open ? { agentId: agent.id, section: "Customize" } : null)
      }}
    >
      <Popover.Trigger
        aria-label="Agent settings"
        {...stylex.props(rosterStyles.iconButton, rosterStyles.headerAction)}
      >
        <SettingsIcon {...stylex.props(rosterStyles.icon)} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align="end"
          sideOffset={10}
          collisionPadding={12}
          {...stylex.props(styles.positioner)}
        >
          <Popover.Popup
            ref={popupRef}
            initialFocus={() => {
              if (!editing?.focusName) return true
              const input = popupRef.current?.querySelector<HTMLInputElement>('input[name="agentName"]')
              input?.select()
              return input ?? true
            }}
            aria-label="Agent settings" {...stylex.props(styles.popup)}>
            <AgentControls agent={agent} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
