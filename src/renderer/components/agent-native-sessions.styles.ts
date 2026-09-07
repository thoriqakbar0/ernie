import * as stylex from "@stylexjs/stylex"
import { theme } from "../theme.stylex"

export const styles = stylex.create({
  inspection: {
    backgroundColor: theme["--surface-muted"],
    borderRadius: 12,
    display: "grid",
    gap: 8,
    minWidth: 0,
    padding: 12,
  },
  list: { display: "grid", gap: 8, maxHeight: 176, overflowY: "auto", paddingBlockStart: 8 },
  name: { fontWeight: 500, minWidth: 0, overflowWrap: "anywhere" },
  receipt: { color: theme["--muted"], gridColumn: "1 / -1" },
  root: { color: theme["--muted"], display: "grid", fontSize: 13, gap: 16, paddingBlockEnd: 16 },
  row: {
    alignItems: "center",
    backgroundColor: { ":hover": theme["--surface-strong"], default: theme["--surface-muted"] },
    borderRadius: 8,
    color: theme["--ink"],
    columnGap: 12,
    cursor: "pointer",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto auto",
    minHeight: 44,
    paddingBlock: 10,
    paddingInline: 12,
    rowGap: 4,
    textAlign: "start",
    width: "100%",
  },
  status: { color: theme["--muted"], fontSize: 12 },
  summary: {
    backgroundColor: theme["--surface-muted"],
    borderRadius: 8,
    cursor: "pointer",
    minHeight: 40,
    paddingBlock: 10,
    paddingInline: 12,
  },
})
