import { Menu } from "@base-ui/react/menu"
import * as stylex from "@stylexjs/stylex"
import type { StyledProps } from "./styles"
import { theme } from "../../theme.stylex"

export const DropdownMenu = Menu.Root
export const DropdownMenuTrigger = Menu.Trigger
export const DropdownMenuRadioGroup = Menu.RadioGroup
export const DropdownMenuRadioItemIndicator = Menu.RadioItemIndicator
const styles = stylex.create({
  content: {
    backgroundColor: theme["--surface"],
    borderColor: theme["--rule"],
    borderRadius: 8,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: "0 4px 16px rgb(0 0 0 / 0.12)",
    color: theme["--ink"],
    maxHeight: "var(--available-height)",
    maxWidth: "calc(100vw - 24px)",
    minWidth: 220,
    overflowY: "auto",
    padding: 4,
  },
  item: {
    alignItems: "center",
    backgroundColor: {
      ":is([data-highlighted])": theme["--surface-strong"],
      default: "transparent",
    },
    borderRadius: 4,
    cursor: "default",
    display: "flex",
    fontSize: 13,
    gap: 8,
    minHeight: 36,
    opacity: { ":is([data-disabled])": 0.5, default: 1 },
    overflowWrap: "anywhere",
    padding: "6px 8px",
  },
  positioner: { zIndex: 50 },
})
export const DropdownMenuContent = ({ xstyle, ...props }: StyledProps<Menu.Popup.Props>) => (
  <Menu.Portal>
    <Menu.Positioner
      side="top"
      align="start"
      sideOffset={6}
      collisionPadding={12}
      {...stylex.props(styles.positioner)}
    >
      <Menu.Popup {...stylex.props(styles.content, xstyle)} {...props} />
    </Menu.Positioner>
  </Menu.Portal>
)
export const DropdownMenuItem = ({ xstyle, ...props }: StyledProps<Menu.Item.Props>) => (
  <Menu.Item {...stylex.props(styles.item, xstyle)} {...props} />
)
export const DropdownMenuRadioItem = ({ xstyle, ...props }: StyledProps<Menu.RadioItem.Props>) => (
  <Menu.RadioItem {...stylex.props(styles.item, xstyle)} {...props} />
)
