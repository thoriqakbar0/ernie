import * as stylex from "@stylexjs/stylex"
import { shellLayout } from "../shell-layout.stylex"
import { theme } from "../theme.stylex"

/** Browser shell styles keep the native guest within the visible panel. */
export const styles = stylex.create({
  address: {
    backgroundColor: theme["--canvas"],
    borderColor: theme["--rule"],
    borderRadius: 6,
    borderStyle: "solid",
    borderWidth: 1,
    color: theme["--ink"],
    flex: 1,
    minWidth: 100,
    padding: 6,
  },
  button: {
    backgroundColor: {
      ":hover:not(:disabled)": theme["--surface-muted"],
      default: theme["--surface"],
    },
    borderColor: theme["--rule"],
    borderRadius: 6,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: { ":focus-visible": `0 0 0 2px ${theme["--focus"]}`, default: "none" },
    color: theme["--ink"],
    cursor: "pointer",
    minHeight: 32,
    opacity: { ":disabled": 0.45, default: 1 },
    padding: "6px 8px",
  },
  conversation: { display: "grid", minHeight: 0, minWidth: 0, overflow: "hidden" },
  guest: { display: "flex", flex: 1, minHeight: 0, width: "100%" },
  hidden: { display: "none" },
  launcher: {
    borderBottomColor: theme["--rule"],
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "flex",
    justifyContent: "flex-end",
    padding: 4,
  },
  notice: { color: theme["--muted"], fontSize: 13, overflowWrap: "anywhere", padding: "8px 12px" },
  page: { display: "flex", flex: 1, flexDirection: "column", minHeight: 0 },
  panel: {
    backgroundColor: theme["--surface"],
    borderRightColor: theme["--rule"],
    borderRightStyle: "solid",
    borderRightWidth: 1,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    minWidth: 0,
  },
  panelHeader: { paddingInlineStart: shellLayout.headerInset },
  selected: { backgroundColor: theme["--surface-strong"] },
  split: { display: "grid", flex: 1, gridTemplateColumns: "minmax(0, 1fr)", minHeight: 0 },
  splitOpen: {
    gridTemplateColumns: {
      "@media (max-width: 1000px)": "minmax(0, 1fr)",
      default: "minmax(320px, 1fr) minmax(0, 1fr)",
    },
    gridTemplateRows: {
      "@media (max-width: 1000px)": "minmax(180px, 1fr) minmax(260px, 1fr)",
      default: "minmax(0, 1fr)",
    },
  },
  tab: { display: "flex", flexShrink: 0 },
  tabs: { display: "flex", gap: 4, overflowX: "auto", padding: "0 6px" },
  title: { flex: 1, fontSize: 14, fontWeight: 600, margin: 0 },
  toolbar: { alignItems: "center", display: "flex", flexWrap: "wrap", gap: 4, padding: 6 },
  workspace: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0 },
})
