import { Tooltip } from "@base-ui/react/tooltip"
import * as stylex from "@stylexjs/stylex"
import { theme } from "../theme.stylex"

const styles = stylex.create({
  popup: {
    backgroundColor: theme["--surface"],
    borderColor: theme["--rule"],
    borderRadius: 8,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: "0 4px 16px #0002",
    color: theme["--ink"],
    fontSize: 12,
    lineHeight: 1.5,
    maxWidth: "min(280px, calc(100vw - 24px))",
    padding: "8px 12px",
  },
  positioner: { zIndex: 100 },
  ready: { color: theme["--success"] },
  trigger: {
    backgroundColor: "transparent",
    borderWidth: 0,
    color: theme["--muted"],
    cursor: "default",
    fontFamily: "inherit",
    fontSize: "inherit",
    lineHeight: "inherit",
    minHeight: 24,
    padding: 0,
    textAlign: "start",
  },
})

/** Connection metadata is available on hover and focus, with native tooltip dismissal. */
export const RuntimeConnectionStatus = ({
  label,
  version,
  clientVersion,
}: {
  label: string
  version: string | undefined
  clientVersion: string
}) => (
  <Tooltip.Provider>
    <Tooltip.Root>
      <Tooltip.Trigger {...stylex.props(styles.trigger, version !== undefined && styles.ready)}>
        {label}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner
          side="top"
          align="end"
          sideOffset={8}
          {...stylex.props(styles.positioner)}
        >
          <Tooltip.Popup {...stylex.props(styles.popup)}>
            {version ? `Prime Agent ${version}` : `Prime Agent ${clientVersion} (installed client)`}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  </Tooltip.Provider>
)
