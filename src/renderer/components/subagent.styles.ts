import * as stylex from "@stylexjs/stylex"
import { CheckIcon, CircleAlertIcon, ClockIcon, LoaderCircleIcon, XIcon } from "lucide-react"
import type { PrimeRlmChild } from "../../packages/prime-agent"
import { theme } from "../theme.stylex"

export const styles = stylex.create({
  back: {
    alignItems: "center",
    backgroundColor: "transparent",
    boxShadow: { ":focus-visible": "0 0 0 2px var(--focus)", default: null },
    color: theme["--muted"],
    cursor: "pointer",
    display: "inline-flex",
    gap: 8,
    minHeight: 40,
    textAlign: "start",
  },
  header: {
    borderBottomColor: theme["--rule"],
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "grid",
    gap: 8,
    padding: "16px 20px",
  },
  item: { flexShrink: 0 },
  list: {
    display: "flex",
    gap: 2,
    listStyle: "none",
    margin: 0,
    padding: 3,
  },
  more: {
    alignContent: "center",
    borderRadius: 6,
    boxShadow: { ":focus-visible": "0 0 0 2px var(--focus)", default: null },
    cursor: "pointer",
    fontSize: 12,
    minHeight: 40,
    minWidth: 32,
    textAlign: "center",
  },
  overflow: { flexShrink: 0, position: "relative" },
  overflowList: {
    backgroundColor: theme["--surface-strong"],
    borderRadius: 8,
    boxShadow: "0 2px 12px #0002",
    display: "flex",
    flexWrap: "wrap",
    gap: 4,
    insetInlineEnd: 0,
    listStyle: "none",
    margin: 0,
    maxHeight: "50dvh",
    overflowY: "auto",
    padding: 8,
    position: "absolute",
    width: 200,
    zIndex: 20,
  },
  panel: {
    borderRadius: 0,
    display: "flex",
    flexDirection: "column",
    gap: 0,
    height: "100dvh",
    insetInlineEnd: 0,
    insetInlineStart: "auto",
    maxHeight: "100dvh",
    maxWidth: "100%",
    overflowY: "hidden",
    padding: 0,
    top: 0,
    transform: "none",
    width: "min(640px, 100%)",
  },
  participant: { alignItems: "center", display: "flex", gap: 10, minWidth: 0 },
  root: { alignItems: "center", display: "flex", minWidth: 0 },
  row: {
    alignItems: "center",
    backgroundColor: { ":hover": theme["--surface-muted"], default: "transparent" },
    borderRadius: 6,
    boxShadow: { ":focus-visible": "0 0 0 2px var(--focus)", default: null },
    color: theme["--muted"],
    cursor: "pointer",
    display: "flex",
    gap: 2,
    minHeight: 40,
    padding: 3,
    position: "relative",
  },
  status: { bottom: 2, insetInlineStart: 24, position: "absolute" },
  tooltip: {
    backgroundColor: theme["--surface-strong"],
    borderRadius: 6,
    color: theme["--ink"],
    fontSize: 12,
    maxWidth: 280,
    overflowWrap: "anywhere",
    padding: "6px 10px",
  },
  tooltipPositioner: { zIndex: 100 },
})

export const statusOf = (
  child: PrimeRlmChild,
): "Cancelled" | "Done" | "Error" | "Queued" | "Running" | "Waiting" => {
  if (child.status === "running") {
    return child.activity?.kind === "waiting" ? "Waiting" : "Running"
  }
  return ({ cancelled: "Cancelled", done: "Done", error: "Error", queued: "Queued" } as const)[
    child.status
  ]
}
export const icons = {
  Cancelled: XIcon,
  Done: CheckIcon,
  Error: CircleAlertIcon,
  Queued: ClockIcon,
  Running: LoaderCircleIcon,
  Waiting: ClockIcon,
}
