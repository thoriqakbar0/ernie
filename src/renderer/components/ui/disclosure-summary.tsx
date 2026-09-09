import * as stylex from "@stylexjs/stylex"
import { ChevronRightIcon } from "lucide-react"
import type { ComponentPropsWithRef, ReactNode } from "react"
import type { StyledProps } from "./styles"

const styles = stylex.create({
  indicator: {
    flexShrink: 0,
    transform: {
      ":is(details[open] > summary > svg)": "rotate(90deg)",
      default: "rotate(0deg)",
    },
    transitionDuration: { "@media (prefers-reduced-motion: reduce)": "0ms", default: "160ms" },
    transitionProperty: "transform",
  },
  markerReset: {
    "::-webkit-details-marker": { display: "none" },
    display: "flex",
    listStyleType: "none",
  },
  summary: {
    alignItems: "center",
    borderRadius: 6,
    boxShadow: { ":focus-visible": "0 0 0 2px var(--focus)", default: null },
    cursor: "pointer",
    gap: 6,
    minHeight: 32,
    minWidth: 0,
    paddingBlock: 4,
  },
})

const defaultIndicator = (
  <ChevronRightIcon size={14} aria-hidden="true" {...stylex.props(styles.indicator)} />
)

/** Preserves native disclosure behavior with a styled indicator and keyboard focus. */
export const DisclosureSummary = ({
  children,
  indicator = defaultIndicator,
  xstyle,
  ...props
}: StyledProps<ComponentPropsWithRef<"summary">> & { indicator?: ReactNode }) => (
  <summary {...props} {...stylex.props(styles.summary, xstyle, styles.markerReset)}>
    {children}
    {indicator}
  </summary>
)
