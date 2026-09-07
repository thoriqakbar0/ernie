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
  heading: { color: theme["--ink"], fontSize: 14, fontWeight: 500 },
  list: {
    display: "grid",
    gap: 2,
    listStyle: "none",
    margin: 0,
    maxHeight: "min(200px, 25dvh)",
    overflowY: "auto",
    padding: 0,
  },
  name: { color: theme["--ink"], fontWeight: 500, overflowWrap: "anywhere" },
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
  preview: {
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
    color: theme["--muted"],
    display: "-webkit-box",
    fontSize: 13,
    gridColumn: "2 / -1",
    overflow: "hidden",
    overflowWrap: "anywhere",
  },
  root: {
    borderBottomColor: theme["--rule"],
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "grid",
    flexShrink: 0,
    fontSize: 13,
    gap: 8,
    minWidth: 0,
    padding: "12px 20px",
  },
  row: {
    alignItems: "center",
    backgroundColor: { ":hover": theme["--surface-muted"], default: "transparent" },
    borderRadius: 8,
    boxShadow: { ":focus-visible": "0 0 0 2px var(--focus)", default: null },
    color: theme["--muted"],
    cursor: "pointer",
    display: "grid",
    gap: "4px 8px",
    gridTemplateColumns: "16px minmax(0, 1fr) auto 16px",
    minHeight: 48,
    padding: "10px 8px",
    textAlign: "start",
    width: "100%",
  },
  status: { fontSize: 12, whiteSpace: "nowrap" },
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
