import * as stylex from "@stylexjs/stylex"
import { theme } from "../theme.stylex"

/** Shared panel geometry keeps settings in document flow rather than over the message. */
export const styles = stylex.create({
  chip: {
    alignItems: "center",
    backgroundColor: { ":hover": theme["--surface-muted"], default: "transparent" },
    borderRadius: 10,
    color: theme["--muted"],
    cursor: "pointer",
    display: "inline-flex",
    fontSize: 13,
    gap: 8,
    maxWidth: "calc(100% - 48px)",
    minHeight: 40,
    padding: "2px 6px",
  },
  close: {
    borderRadius: 8,
    color: theme["--muted"],
    cursor: "pointer",
    display: "grid",
    height: 40,
    placeItems: "center",
    width: 40,
  },
  header: {
    alignItems: "center",
    display: "flex",
    gap: 8,
    justifyContent: "space-between",
    marginBottom: 12,
  },
  inline: {
    backgroundColor: theme["--surface-muted"],
    borderRadius: 16,
    marginTop: 16,
    padding: 18,
  },
  name: { minWidth: 0, overflowWrap: "anywhere" },
  panel: { color: theme["--ink"], minWidth: 0, textAlign: "left" },
  title: { fontSize: 16, fontWeight: 600, lineHeight: 1.1, margin: 0, textWrap: "balance" },
})
