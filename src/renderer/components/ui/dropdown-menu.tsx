import { Menu } from "@base-ui/react/menu"
import * as stylex from "@stylexjs/stylex"
import type { StyledProps } from "./styles"
import { theme } from "../../theme.stylex"

export const DropdownMenu = Menu.Root
export const DropdownMenuTrigger = Menu.Trigger
export const DropdownMenuRadioGroup = Menu.RadioGroup
export const DropdownMenuRadioItemIndicator = Menu.RadioItemIndicator
export function DropdownMenuContent({ xstyle, ...props }: StyledProps<Menu.Popup.Props>) {
  return <Menu.Portal><Menu.Positioner side="top" align="start" sideOffset={6} collisionPadding={12} {...stylex.props(styles.positioner)}><Menu.Popup {...stylex.props(styles.content, xstyle)} {...props}/></Menu.Positioner></Menu.Portal>
}
export function DropdownMenuItem({ xstyle, ...props }: StyledProps<Menu.Item.Props>) {
  return <Menu.Item {...stylex.props(styles.item, xstyle)} {...props}/>
}
export function DropdownMenuRadioItem({ xstyle, ...props }: StyledProps<Menu.RadioItem.Props>) {
  return <Menu.RadioItem {...stylex.props(styles.item, xstyle)} {...props}/>
}
const styles = stylex.create({
  positioner: { zIndex: 50 },
  content: { minWidth: 220, maxWidth: "calc(100vw - 24px)", maxHeight: "var(--available-height)", overflowY: "auto", padding: 4, borderRadius: 8, borderWidth: 1, borderStyle: "solid", borderColor: theme["--rule"], backgroundColor: theme["--surface"], color: theme["--ink"], boxShadow: "0 4px 16px rgb(0 0 0 / 0.12)" },
  item: { display: "flex", alignItems: "center", gap: 8, minHeight: 36, padding: "6px 8px", fontSize: 13, borderRadius: 4, cursor: "default", outlineWidth: 0, backgroundColor: { default: "transparent", ':is([data-highlighted])': theme["--surface-strong"] }, opacity: { default: 1, ':is([data-disabled])': 0.5 }, overflowWrap: "anywhere" },
})
