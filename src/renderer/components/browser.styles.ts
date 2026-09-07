import * as stylex from "@stylexjs/stylex"
import { theme } from "../theme.stylex"

/** Browser shell styles keep the native guest within the visible panel. */
export const styles = stylex.create({
  workspace: { display: "flex", flexDirection: "column", minHeight: 0, height: "100%" },
  launcher: { display: "flex", justifyContent: "flex-end", padding: 4, borderBottom: `1px solid ${theme["--rule"]}` },
  split: { display: "grid", gridTemplateColumns: "minmax(0, 1fr)", flex: 1, minHeight: 0 },
  splitOpen: { gridTemplateColumns: { default: "minmax(0, 1fr) minmax(320px, 1fr)", "@media (max-width: 1000px)": "minmax(0, 1fr)" }, gridTemplateRows: { default: "minmax(0, 1fr)", "@media (max-width: 1000px)": "minmax(180px, 1fr) minmax(260px, 1fr)" } },
  conversation: { display: "grid", minWidth: 0, minHeight: 0, overflow: "hidden" },
  panel: { display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, borderLeft: `1px solid ${theme["--rule"]}`, backgroundColor: theme["--surface"] },
  hidden: { display: "none" },
  toolbar: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4, padding: 6 },
  title: { fontSize: 14, fontWeight: 600, flex: 1, margin: 0 },
  button: { border: `1px solid ${theme["--rule"]}`, borderRadius: 6, padding: "6px 8px", minHeight: 32, color: theme["--ink"], backgroundColor: { default: theme["--surface"], ":hover:not(:disabled)": theme["--surface-muted"] }, cursor: "pointer", opacity: { default: 1, ":disabled": 0.45 }, outlineWidth: { default: 0, ":focus-visible": 2 }, outlineStyle: "solid", outlineColor: theme["--focus"] },
  address: { flex: 1, minWidth: 100, border: `1px solid ${theme["--rule"]}`, borderRadius: 6, padding: 6, color: theme["--ink"], backgroundColor: theme["--canvas"] },
  tabs: { display: "flex", overflowX: "auto", gap: 4, padding: "0 6px" },
  tab: { display: "flex", flexShrink: 0 },
  selected: { backgroundColor: theme["--surface-strong"] },
  page: { display: "flex", flexDirection: "column", flex: 1, minHeight: 0 },
  guest: { display: "flex", flex: 1, minHeight: 0, width: "100%" },
  notice: { padding: "8px 12px", fontSize: 13, color: theme["--muted"], overflowWrap: "anywhere" },
})
