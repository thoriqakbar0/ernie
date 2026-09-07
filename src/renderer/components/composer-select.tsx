import * as stylex from "@stylexjs/stylex"
import { theme } from "../theme.stylex"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"

const styles = stylex.create({
  trigger: {
    backgroundColor: { ":hover": theme["--surface-muted"], default: "transparent" },
    borderWidth: 0,
    boxShadow: "none",
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
  description,
  value,
  options,
  disabled,
  placeholder = "Default",
  onChange,
}: {
  label: string
  description?: string
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
    <SelectTrigger
      aria-label={label}
      aria-description={description}
      title={description}
      size="sm"
      xstyle={[styles.trigger]}
    >
      <span>{label}</span>
      <SelectValue placeholder={placeholder} />
    </SelectTrigger>
    <SelectContent align="start">
      {options.map((option) => (
        <SelectItem key={option.value} value={option.value}>
          {option.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
)
