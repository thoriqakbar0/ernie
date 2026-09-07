import { Tabs } from "@base-ui/react/tabs"
import * as stylex from "@stylexjs/stylex"
import type { ReactNode } from "react"
import { theme } from "../../theme.stylex"

export interface AnimatedTabsProps {
  tabs: readonly { label: string; value?: string; disabled?: boolean }[]
  value?: string | null
  onValueChange?: (value: string) => void
  disabled?: boolean
  label?: string
  shape?: "pill" | "rounded"
  wrap?: boolean
  onDeselect?: () => void
  "aria-label"?: string
  children?: ReactNode
}

/** A single accessible tab list with a moving selection pill. Panels share its Base UI context. */
export function AnimatedTabs({ tabs, value, onValueChange, disabled, wrap, onDeselect, children, label = "Sections", shape = "pill", "aria-label": ariaLabel }: AnimatedTabsProps) {
  return <Tabs.Root value={value} defaultValue={tabs[0]?.value ?? tabs[0]?.label ?? null} onValueChange={(next) => {
    if (typeof next === "string") onValueChange?.(next)
  }} {...stylex.props(styles.root)}>
    <Tabs.List aria-label={ariaLabel ?? label} {...stylex.props(styles.list, shape === "rounded" && styles.roundedList, wrap && styles.wrap)}>
      <Tabs.Indicator {...stylex.props(styles.indicator, shape === "rounded" && styles.roundedTab)}/>
      {tabs.map((tab) => <Tabs.Tab key={tab.value ?? tab.label} value={tab.value ?? tab.label} onClick={() => { if (value === (tab.value ?? tab.label)) onDeselect?.() }} disabled={disabled || tab.disabled} {...stylex.props(styles.tab, shape === "rounded" && styles.roundedTab)}>{tab.label}</Tabs.Tab>)}
    </Tabs.List>
    {children}
  </Tabs.Root>
}

const styles = stylex.create({
  roundedList: { borderRadius: 12 },
  roundedTab: { borderRadius: 8 },
  root: { minWidth: 0, gridColumn: "1 / -1" },
  list: { position: "relative", isolation: "isolate", display: "flex", width: "fit-content", maxWidth: "100%", overflowX: "auto", alignItems: "center", gap: 5, padding: 4, marginBlock: 8, borderRadius: 999, backgroundColor: theme["--surface-muted"], borderWidth: 1, borderStyle: "solid", borderColor: theme["--rule"] },
  wrap: { flexWrap: "wrap", overflowX: "visible", width: "100%", borderRadius: 12 },
  tab: { position: "relative", zIndex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, height: 36, paddingInline: 6, borderRadius: 999, fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", cursor: "pointer", backgroundColor: "transparent", borderWidth: 0, color: { default: theme["--muted"], ':is([data-active])': theme["--surface" ] }, outlineWidth: { default: 0, ":focus-visible": 2 }, outlineStyle: "solid", outlineOffset: -3, outlineColor: "currentColor", opacity: { default: 1, ":disabled": 0.5 } },
  indicator: { position: "absolute", zIndex: 0, left: 0, top: 0, width: "var(--active-tab-width)", height: "var(--active-tab-height)", transform: "translate(var(--active-tab-left), var(--active-tab-top))", borderRadius: 999, backgroundColor: theme["--ink"], pointerEvents: "none", transitionProperty: "transform, width, height", transitionDuration: { default: "250ms", "@media (prefers-reduced-motion: reduce)": "0ms" }, transitionTimingFunction: "ease" },
})
