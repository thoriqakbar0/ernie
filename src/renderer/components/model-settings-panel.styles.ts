import * as stylex from "@stylexjs/stylex"

const enter = stylex.keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
})

/** Shared panel space keeps model settings anchored while the selected tab changes. */
export const modelSettingsPanelStyles = stylex.create({
  panel: {
    animationDuration: { "@media (prefers-reduced-motion: no-preference)": "180ms", default: "0ms" },
    animationName: enter,
    animationTimingFunction: "cubic-bezier(.22, 1, .36, 1)",
    minHeight: 104,
    minWidth: 0,
    paddingBlock: 16,
    paddingInline: 4,
  },
})
