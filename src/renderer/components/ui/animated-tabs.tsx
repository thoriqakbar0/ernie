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
  shape?: "pill" | "rounded" | "plain"
  wrap?: boolean
  onDeselect?: () => void
  "aria-label"?: string
  children?: ReactNode
}

const styles = stylex.create({
  indicator: {
    backgroundColor: theme["--ink"],
    borderRadius: 999,
    height: "var(--active-tab-height)",
    left: 0,
    pointerEvents: "none",
    position: "absolute",
    top: 0,
    transform: "translate(var(--active-tab-left), var(--active-tab-top))",
    transitionDuration: { "@media (prefers-reduced-motion: reduce)": "0ms", default: "250ms" },
    transitionProperty: "transform, width, height",
    transitionTimingFunction: "ease",
    width: "var(--active-tab-width)",
    zIndex: 0,
  },
  list: {
    alignItems: "center",
    backgroundColor: theme["--surface-muted"],
    borderColor: theme["--rule"],
    borderRadius: 999,
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    gap: 5,
    isolation: "isolate",
    marginBlock: 8,
    maxWidth: "100%",
    overflowX: "auto",
    padding: 4,
    position: "relative",
    width: "fit-content",
  },
  plainList: {
    backgroundColor: "transparent",
    borderRadius: 0,
    borderWidth: 0,
    gap: 24,
    marginBlock: 0,
    padding: 0,
  },
  plainTab: {
    borderBottomColor: { ":is([data-active])": theme["--ink"], default: "transparent" },
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    borderRadius: 0,
    color: { ":is([data-active])": theme["--ink"], default: theme["--muted"] },
    fontSize: 13,
    height: 40,
    paddingInline: 0,
  },
  root: { gridColumn: "1 / -1", minWidth: 0 },
  roundedList: { borderRadius: 12 },
  roundedTab: { borderRadius: 8 },
  tab: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderRadius: 999,
    borderWidth: 0,
    boxShadow: { ":focus-visible": "inset 0 0 0 2px var(--focus)", default: null },
    color: { ":is([data-active])": theme["--surface"], default: theme["--muted"] },
    cursor: "pointer",
    display: "inline-flex",
    flexShrink: 0,
    fontSize: 12,
    fontWeight: 500,
    height: 36,
    justifyContent: "center",
    opacity: { ":disabled": 0.5, default: 1 },
    paddingInline: 6,
    position: "relative",
    whiteSpace: "nowrap",
    zIndex: 1,
  },
  wrap: { borderRadius: 12, flexWrap: "wrap", overflowX: "visible", width: "100%" },
})

/** A single accessible tab list with a moving selection pill. Panels share its Base UI context. */
export const AnimatedTabs = ({
  tabs,
  value,
  onValueChange,
  disabled,
  wrap,
  onDeselect,
  children,
  label = "Sections",
  shape = "pill",
  "aria-label": ariaLabel,
}: AnimatedTabsProps) => (
  <Tabs.Root
    value={value}
    defaultValue={tabs[0]?.value ?? tabs[0]?.label ?? null}
    onValueChange={(next) => {
      if (typeof next === "string") {
        onValueChange?.(next)
      }
    }}
    {...stylex.props(styles.root)}
  >
    <Tabs.List
      aria-label={ariaLabel ?? label}
      {...stylex.props(
        styles.list,
        shape === "rounded" && styles.roundedList,
        shape === "plain" && styles.plainList,
        wrap && styles.wrap,
      )}
    >
      {shape === "plain" ? null : (
        <Tabs.Indicator
          {...stylex.props(styles.indicator, shape === "rounded" && styles.roundedTab)}
        />
      )}
      {tabs.map((tab) => (
        <Tabs.Tab
          key={tab.value ?? tab.label}
          value={tab.value ?? tab.label}
          onClick={() => {
            if (value === (tab.value ?? tab.label)) {
              onDeselect?.()
            }
          }}
          disabled={disabled || tab.disabled}
          {...stylex.props(
            styles.tab,
            shape === "rounded" && styles.roundedTab,
            shape === "plain" && styles.plainTab,
          )}
        >
          {tab.label}
        </Tabs.Tab>
      ))}
    </Tabs.List>
    {children}
  </Tabs.Root>
)
