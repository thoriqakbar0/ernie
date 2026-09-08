import { Accordion } from "@base-ui/react/accordion"
import { ChevronDownIcon } from "lucide-react"
import { useState, type ReactNode } from "react"
import * as stylex from "@stylexjs/stylex"

const styles = stylex.create({
  header: { margin: 0 },
  trigger: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderWidth: 0,
    color: "inherit",
    cursor: "pointer",
    display: "flex",
    fontSize: 13,
    gap: 8,
    justifyContent: "space-between",
    padding: "6px 0",
    textAlign: "start",
    width: "100%",
    outline: { default: "none", ":focus-visible": "2px solid var(--focus)" },
    outlineOffset: 2,
  },
  expanded: { transform: "rotate(180deg)" },
})

/** Running output stays visible; settled sections can be folded independently. */
export const RunSection = ({
  title,
  running = false,
  children,
}: {
  title: string
  running?: boolean
  children: ReactNode
}) => {
  const [open, setOpen] = useState(true)
  const expanded = running || open
  return (
    <Accordion.Root<string>
      value={expanded ? ["section"] : []}
      onValueChange={(value) => {
        if (!running) setOpen(value.includes("section"))
      }}
    >
      <Accordion.Item value="section">
        <Accordion.Header {...stylex.props(styles.header)}>
          {running ? <span {...stylex.props(styles.trigger)} style={{ cursor: "default" }}>{title} · Running…</span> : <Accordion.Trigger {...stylex.props(styles.trigger)}>
            {title}
            <ChevronDownIcon size={14} aria-hidden="true" {...stylex.props(expanded && styles.expanded)} />
          </Accordion.Trigger>}
        </Accordion.Header>
        <Accordion.Panel keepMounted aria-label={title}>{children}</Accordion.Panel>
      </Accordion.Item>
    </Accordion.Root>
  )
}
