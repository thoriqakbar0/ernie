import type { ReactNode } from "react"
import { Tabs } from "@base-ui/react/tabs"
import * as stylex from "@stylexjs/stylex"
import { theme } from "../../theme.stylex"

/** Tab values default to labels; supply distinct values when labels may change. */
export interface AnimatedTabsProps {
  tabs: readonly { label: string; value?: string }[]
  value?: string
  onValueChange?: (value: string) => void
  children?: ReactNode
  label?: string
  shape?: "pill" | "rounded"
}

/** Accessible pill tabs with a measured sliding indicator and optional controlled panels. */
export function AnimatedTabs({ tabs, value, onValueChange, children, label = "Sections", shape = "pill" }: AnimatedTabsProps) {
  return <Tabs.Root value={value} defaultValue={tabs[0]?.value ?? tabs[0]?.label ?? null} onValueChange={next => { if (typeof next === "string") onValueChange?.(next) }}>
    <Tabs.List aria-label={label} activateOnFocus {...stylex.props(styles.list, shape === "rounded" && styles.roundedList)}>
      {tabs.map(tab => <Tabs.Tab key={tab.value ?? tab.label} value={tab.value ?? tab.label} {...stylex.props(styles.tab, shape === "rounded" && styles.roundedTab)}>{tab.label}</Tabs.Tab>)}
      <Tabs.Indicator {...stylex.props(styles.indicator, shape === "rounded" && styles.roundedTab)}/>
    </Tabs.List>
    {children}
  </Tabs.Root>
}
const styles = stylex.create({
  roundedList: { borderRadius: 12 },
  roundedTab: { borderRadius: 8 },
  list: { position: "relative", isolation: "isolate", display: "flex", width: "fit-content", maxWidth: "100%", overflowX: "auto", gap: 2, padding: 4, borderRadius: 999, backgroundColor: theme["--surface-muted"], borderWidth: 1, borderStyle: "solid", borderColor: theme["--rule"], marginBottom: 24 },
  tab: { position: "relative", zIndex: 1, flexShrink: 0, minHeight: 36, padding: "8px 16px", borderRadius: 999, fontSize: 14, fontWeight: 500, cursor: "pointer", color: { default: theme["--muted"], ':is([data-active])': theme["--surface"] }, transition: "color 250ms ease", '@media (prefers-reduced-motion: reduce)': { transition: "none" } },
  indicator: { position: "absolute", zIndex: 0, left: 0, top: "var(--active-tab-top)", width: "var(--active-tab-width)", height: "var(--active-tab-height)", transform: "translateX(var(--active-tab-left))", borderRadius: 999, backgroundColor: theme["--ink"], transition: "transform 250ms ease, width 250ms ease", '@media (prefers-reduced-motion: reduce)': { transition: "none" } },
})
