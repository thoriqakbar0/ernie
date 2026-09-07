import * as stylex from "@stylexjs/stylex"
import { theme } from "../theme.stylex"

export const styles = stylex.create({
  character: {
    display: "inline-flex",
    height: { "@media (max-width: 480px)": 48, default: 72 },
    width: { "@media (max-width: 480px)": 48, default: 72 },
  },
  characters: {
    alignItems: "center",
    display: "flex",
    gap: 0,
    height: 41,
    justifyContent: "center",
    marginBottom: 20,
    marginInline: "auto",
    marginTop: -8,
    width: 121,
  },
  content: { marginInline: "auto", maxWidth: 650, textAlign: "center", width: "100%" },
  emphasis: { color: theme["--focus"], fontStyle: "italic" },
  title: {
    color: theme["--ink-strong"],
    fontFamily: '"gelica", Georgia, serif',
    fontSize: "clamp(38px, 5vw, 68px)",
    fontWeight: 500,
    letterSpacing: "-0.045em",
    lineHeight: 1.08,
    margin: "0 0 36px",
    textWrap: "balance",
  },
  welcome: {
    alignContent: "safe center",
    display: "grid",
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    padding: { "@media (max-width: 720px)": "56px 24px", default: "64px 56px" },
  },
})
