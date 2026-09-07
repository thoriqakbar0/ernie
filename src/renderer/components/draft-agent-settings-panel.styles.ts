import * as stylex from "@stylexjs/stylex"
import { theme } from "../theme.stylex"

/** Shared panel geometry keeps settings in document flow rather than over the message. */
export const styles = stylex.create({
  panel: { minWidth: 0, color: theme["--ink"], textAlign: "left" },
  inline: { marginTop: 16, padding: 18, borderRadius: 16, backgroundColor: theme["--surface-muted"] },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 },
  title: { margin: 0, fontSize: 16, fontWeight: 600, lineHeight: 1.1, textWrap: "balance" },
  close: { display: "grid", placeItems: "center", width: 40, height: 40, borderRadius: 8, color: theme["--muted"], cursor: "pointer" },
  chip: { display: "inline-flex", alignItems: "center", gap: 8, maxWidth: "calc(100% - 48px)", minHeight: 40, padding: "2px 6px", borderRadius: 10, color: theme["--muted"], fontSize: 13, cursor: "pointer", backgroundColor: { default: "transparent", ":hover": theme["--surface-muted"] } },
  name: { overflowWrap: "anywhere", minWidth: 0 },
})
