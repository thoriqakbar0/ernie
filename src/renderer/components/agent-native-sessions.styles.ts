import * as stylex from "@stylexjs/stylex"
import { theme } from "../theme.stylex"

export const styles = stylex.create({
  root: { display: "grid", gap: 16, paddingBlockEnd: 16, color: theme["--muted"], fontSize: 13 },
  summary: { cursor: "pointer", paddingBlock: 10, paddingInline: 12, minHeight: 40, borderRadius: 8, backgroundColor: theme["--surface-muted"] },
  list: { display: "grid", gap: 8, paddingBlockStart: 8, maxHeight: 176, overflowY: "auto" },
  row: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto auto", alignItems: "center", columnGap: 12, rowGap: 4, width: "100%", minHeight: 44, paddingBlock: 10, paddingInline: 12, textAlign: "start", borderRadius: 8, color: theme["--ink"], backgroundColor: { default: theme["--surface-muted"], ":hover": theme["--surface-strong"] }, cursor: "pointer" },
  name: { minWidth: 0, overflowWrap: "anywhere", fontWeight: 500 },
  status: { fontSize: 12, color: theme["--muted"] },
  receipt: { gridColumn: "1 / -1", color: theme["--muted"] },
  inspection: { display: "grid", gap: 8, minWidth: 0, padding: 12, borderRadius: 12, backgroundColor: theme["--surface-muted"] },
})
