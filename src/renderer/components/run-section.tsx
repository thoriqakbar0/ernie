import { Accordion } from "@base-ui/react/accordion"
import { ChevronDownIcon } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
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
    fontSize: "var(--run-label-size, 13px)",
    gap: "var(--run-label-gap, 8px)",
    justifyContent: "space-between",
    padding: "var(--run-label-padding, 6px) 0",
    minHeight: 28,
    textAlign: "start",
    width: "100%",
    outline: { default: "none", ":focus-visible": "2px solid var(--focus)" },
    outlineOffset: 2,
  },
  expanded: { transform: "rotate(180deg)" },
})

/** Active and settled output can be folded independently. */
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
  useEffect(() => {
    if (running) setOpen(true)
  }, [running])

  const expanded = open
  return (
    <Accordion.Root<string>
      value={expanded ? ["section"] : []}
      onValueChange={(value) => setOpen(value.includes("section"))}
    >
      <Accordion.Item value="section">
        <Accordion.Header {...stylex.props(styles.header)}>
          <Accordion.Trigger {...stylex.props(styles.trigger)}>
            {title}
            {running ? " · Running…" : null}
            <ChevronDownIcon size={14} aria-hidden="true" {...stylex.props(expanded && styles.expanded)} />
          </Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Panel keepMounted aria-label={title}>{children}</Accordion.Panel>
      </Accordion.Item>
    </Accordion.Root>
  )
}
