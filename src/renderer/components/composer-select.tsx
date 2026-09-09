import { Tooltip } from "@base-ui/react/tooltip"
import type { LucideIcon } from "lucide-react"
import * as stylex from "@stylexjs/stylex"
import { theme } from "../theme.stylex"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"

const styles = stylex.create({
  popup: {
    backgroundColor: theme["--surface"],
    borderColor: theme["--rule"],
    borderRadius: 8,
    borderStyle: "solid",
    borderWidth: 1,
    color: theme["--ink"],
    fontSize: 12,
    lineHeight: 1.5,
    maxWidth: "min(280px, calc(100vw - 24px))",
    padding: "8px 12px",
  },
  positioner: { zIndex: 100 },
  trigger: {
    backgroundColor: { ":hover": theme["--surface-muted"], default: "transparent" },
    borderWidth: 0,
    boxShadow: { ":focus-visible": "0 0 0 2px var(--focus)", default: "none" },
    color: theme["--muted"],
    fontSize: 12,
    gap: 5,
    minHeight: 36,
    paddingInline: 8,
    width: "auto",
  },
})

/** Compact, labelled composer choices use the shared accessible select behavior. */
export const ComposerSelect = ({
  label,
  compact = false,
  description,
  icon: Icon,
  value,
  options,
  disabled,
  placeholder = "Default",
  onChange,
}: {
  label: string
  compact?: boolean
  description: string
  icon: LucideIcon
  value: string | undefined
  options: readonly { value: string; label: string }[]
  disabled: boolean
  placeholder?: string
  onChange: (value: string) => void
}) => (
  <Select
    disabled={disabled}
    value={value ?? null}
    onValueChange={(next) => {
      if (next !== null && options.some((option) => option.value === next)) {
        onChange(next)
      }
    }}
  >
    <Tooltip.Provider>
      <Tooltip.Root>
        <Tooltip.Trigger
          render={
            <SelectTrigger
              aria-label={label}
              aria-description={description}
              size="sm"
              xstyle={styles.trigger}
            />
          }
        >
          <Icon size={14} aria-hidden="true" />
          {compact ? null : <span>{label} ·</span>}
          <SelectValue placeholder={placeholder}>
            {options.find((option) => option.value === value)?.label}
          </SelectValue>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Positioner side="top" sideOffset={8} {...stylex.props(styles.positioner)}>
            <Tooltip.Popup {...stylex.props(styles.popup)}>{description}</Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
    <SelectContent align="start">
      {options.map((option) => (
        <SelectItem key={option.value} value={option.value}>
          {option.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
)
