import { Tooltip } from "@base-ui/react/tooltip"
import * as stylex from "@stylexjs/stylex"
import { theme } from "../theme.stylex"

const styles = stylex.create({
  name: {
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
    backgroundColor: "transparent",
    borderWidth: 0,
    boxShadow: { ":focus-visible": `inset 0 0 0 2px ${theme["--focus"]}`, default: "none" },
    color: theme["--ink"],
    cursor: "help",
    display: "-webkit-box",
    fontFamily: "inherit",
    fontSize: 14,
    fontWeight: 600,
    lineHeight: 1.35,
    maxWidth: "28ch",
    minWidth: 0,
    overflow: "hidden",
    overflowWrap: "anywhere",
    textAlign: "start",
  },
  popup: {
    backgroundColor: theme["--surface"],
    borderColor: theme["--rule"],
    borderRadius: 6,
    borderStyle: "solid",
    borderWidth: 1,
    color: theme["--ink"],
    fontSize: 13,
    lineHeight: 1.5,
    maxWidth: "min(320px, calc(100vw - 24px))",
    overflowWrap: "anywhere",
    padding: "8px 10px",
  },
  positioner: { zIndex: 100 },
})

/** Long identities keep a compact header and expose their full name on hover or keyboard focus. */
export const AgentHeaderName = ({ name }: { name: string }) =>
  name ? (
    <Tooltip.Root>
      <Tooltip.Trigger type="button" closeOnClick={false} {...stylex.props(styles.name)}>
        {name}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner
          side="bottom"
          align="start"
          sideOffset={6}
          {...stylex.props(styles.positioner)}
        >
          <Tooltip.Popup {...stylex.props(styles.popup)}>{name}</Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  ) : null
