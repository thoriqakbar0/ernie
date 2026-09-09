import { isAgentationInteraction } from "../agentation-interaction"
import { Popover } from "@base-ui/react/popover"
import { Tabs } from "@base-ui/react/tabs"
import { SlidersHorizontalIcon } from "lucide-react"
import type { PropsWithChildren, ReactNode } from "react"
import { AnimatedTabs } from "./ui/animated-tabs"
import { modelSettingsPanelStyles } from "./model-settings-panel.styles"
import * as stylex from "@stylexjs/stylex"

const styles = stylex.create({
  label: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  popup: {
    alignItems: "center",
    backgroundColor: "var(--surface)",
    borderColor: "var(--rule)",
    borderStyle: "solid",
    borderWidth: 1,
    borderRadius: 12,
    boxShadow: "0 8px 32px rgb(0 0 0 / .16)",
    color: "var(--ink)",
    display: "grid",
    gap: 16,
    gridTemplateColumns: "minmax(0, 1fr)",
    maxHeight: "var(--available-height)",
    overflowY: "auto",
    overscrollBehavior: "contain",
    padding: 16,
    opacity: { ":is([data-starting-style], [data-ending-style])": 0, default: 1 },
    transform: {
      "@media (prefers-reduced-motion: no-preference)": {
        ":is([data-starting-style], [data-ending-style])": "translateY(3px) scale(.985)",
        default: "translateY(0) scale(1)",
      },
      default: "none",
    },
    transformOrigin: "var(--transform-origin)",
    transitionDuration: { "@media (prefers-reduced-motion: no-preference)": "220ms", default: "0ms" },
    transitionProperty: "opacity, transform",
    transitionTimingFunction: "cubic-bezier(.22, 1, .36, 1)",
    width: "min(360px, calc(100vw - 24px))",
  },
  positioner: { zIndex: 1100 },
  title: { fontSize: 14, fontWeight: 600, gridColumn: "1 / -1", lineHeight: 1.4, margin: 0, paddingInline: 4 },
  trigger: {
    alignItems: "center",
    color: "var(--muted)",
    cursor: "pointer",
    display: "inline-flex",
    fontSize: 12,
    gap: 6,
    maxWidth: "100%",
    minHeight: 36,
    paddingInline: 8,
  },
})

/** Keeps model selection and inference controls together outside the composer toolbar. */
export const ModelSettingsPopover = ({
  children,
  modelControl,
  inferenceDisabled = false,
  label,
  disabled,
}: PropsWithChildren<{
  label: string
  disabled: boolean
  modelControl: ReactNode
  inferenceDisabled?: boolean
}>) => (
  <Popover.Root
    onOpenChange={(open, details) => {
      if (!open && isAgentationInteraction(details.event)) {
        details.cancel()
      }
    }}
  >
    <Popover.Trigger
      disabled={disabled}
      aria-label="Model settings"
      {...stylex.props(styles.trigger)}
    >
      <SlidersHorizontalIcon size={14} aria-hidden="true" />
      <span {...stylex.props(styles.label)}>{label}</span>
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Positioner
        side="top"
        align="start"
        sideOffset={8}
        collisionPadding={12}
        {...stylex.props(styles.positioner)}
      >
        <Popover.Popup {...stylex.props(styles.popup)}>
          <Popover.Title {...stylex.props(styles.title)}>Model settings</Popover.Title>
          <AnimatedTabs
            label="Model settings sections"
            shape="rounded"
            fill
            tabs={[
              { label: "Model", value: "model" },
              { label: "Reasoning", value: "reasoning", disabled: inferenceDisabled },
              { label: "RLM depth", value: "depth", disabled: inferenceDisabled },
            ]}
          >
            <Tabs.Panel value="model" {...stylex.props(modelSettingsPanelStyles.panel)}>
              {modelControl}
            </Tabs.Panel>
            {children}
          </AnimatedTabs>
        </Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  </Popover.Root>
)
