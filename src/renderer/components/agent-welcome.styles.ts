import * as stylex from "@stylexjs/stylex"
import { theme } from "../theme.stylex"

export const styles = stylex.create({
  character: {
    display: "inline-flex",
    height: "clamp(40px, 11vw, 60px)",
    width: "clamp(40px, 11vw, 60px)",
  },
  characters: {
    alignItems: "center",
    display: "flex",
    justifyContent: "center",
    marginBottom: 12,
  },
  content: { marginInline: "auto", maxWidth: 650, textAlign: "center", width: "100%" },
  title: {
    color: theme["--ink-strong"],
    fontFamily: 'var(--display-font, "gelica", Georgia, serif)',
    fontSize: "clamp(32px, 4.5vw, 60px)",
    fontWeight: 500,
    letterSpacing: "-0.045em",
    lineHeight: 1.08,
    margin: "0 0 24px",
    textWrap: "balance",
  },
  welcome: {
    alignContent: "safe center",
    display: "grid",
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    padding: { "@media (max-width: 720px)": "32px 20px", default: "48px 40px" },
  },
})
