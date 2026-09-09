import { Accordion } from "@base-ui/react/accordion"
import { ChevronDownIcon } from "lucide-react"
import { useState } from "react"
import type { ReactNode } from "react"
import * as stylex from "@stylexjs/stylex"

const styles = stylex.create({
  expanded: { transform: "rotate(180deg)" },
  header: { margin: 0 },
  trigger: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderWidth: 0,
    boxShadow: { ":focus-visible": "0 0 0 2px var(--focus)", default: "none" },
    color: "inherit",
    cursor: "pointer",
    display: "flex",
    fontSize: "var(--run-label-size, 13px)",
    gap: "var(--run-label-gap, 8px)",
    justifyContent: "space-between",
    minHeight: 28,
    outlineStyle: "none",
    padding: "var(--run-label-padding, 6px) 0",
    textAlign: "start",
    width: "100%",
  },
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
  const [disclosure, setDisclosure] = useState({ open: true, running })
  if (disclosure.running !== running) {
    setDisclosure({ open: running || disclosure.open, running })
  }
  const expanded = disclosure.open
  return (
    <Accordion.Root<string>
      value={expanded ? ["section"] : []}
      onValueChange={(value) => setDisclosure({ open: value.includes("section"), running })}
    >
      <Accordion.Item value="section">
        <Accordion.Header {...stylex.props(styles.header)}>
          <Accordion.Trigger {...stylex.props(styles.trigger)}>
            {title}
            {running ? " · Running…" : null}
            <ChevronDownIcon
              size={14}
              aria-hidden="true"
              {...stylex.props(expanded && styles.expanded)}
            />
          </Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Panel keepMounted aria-label={title}>
          {children}
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion.Root>
  )
}
