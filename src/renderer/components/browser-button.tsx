import { Tooltip } from "@base-ui/react/tooltip"
import type { LucideIcon } from "lucide-react"
import type { MouseEventHandler } from "react"
import * as stylex from "@stylexjs/stylex"
import { styles } from "./browser.styles"

/** Browser chrome actions share compact targets and labels on hover and keyboard focus. */
export const BrowserButton = ({
  label,
  icon: Icon,
  disabled = false,
  onClick,
  type = "button",
}: {
  label: string
  icon: LucideIcon
  disabled?: boolean
  onClick?: MouseEventHandler<HTMLButtonElement>
  type?: "button" | "submit"
}) => (
  <Tooltip.Root>
    <Tooltip.Trigger
      render={
        <button
          type={type === "submit" ? "submit" : "button"}
          disabled={disabled}
          aria-label={label}
          onClick={onClick}
          {...stylex.props(styles.button, styles.iconButton)}
        />
      }
    >
      <Icon size={15} aria-hidden="true" />
    </Tooltip.Trigger>
    <Tooltip.Portal>
      <Tooltip.Positioner side="bottom" sideOffset={6} {...stylex.props(styles.tooltipPositioner)}>
        <Tooltip.Popup {...stylex.props(styles.tooltip)}>{label}</Tooltip.Popup>
      </Tooltip.Positioner>
    </Tooltip.Portal>
  </Tooltip.Root>
)
