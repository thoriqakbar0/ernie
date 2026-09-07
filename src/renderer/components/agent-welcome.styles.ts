import * as stylex from "@stylexjs/stylex"
import { theme } from "../theme.stylex"

export const styles = stylex.create({
  welcome: { display: "grid", flex: 1, minHeight: 0, overflowY: "auto", alignContent: "safe center", padding: { default: "64px 56px", "@media (max-width: 720px)": "56px 24px" } },
  content: { textAlign: "center", width: "100%", maxWidth: 650, marginInline: "auto" },
  title: { margin: "0 0 36px", fontFamily: '"gelica", Georgia, serif', fontWeight: 500, fontSize: "clamp(38px, 5vw, 68px)", lineHeight: 1.08, letterSpacing: "-0.045em", color: theme["--ink-strong"], textWrap: "balance" },
  character: { display: "inline-flex", width: { default: 72, "@media (max-width: 480px)": 48 }, height: { default: 72, "@media (max-width: 480px)": 48 } },
  characters: { display: "flex", width: 121, height: 41, justifyContent: "center", alignItems: "center", gap: 0, marginTop: -8, marginBottom: 20, marginInline: "auto" },
  emphasis: { fontStyle: "italic", color: theme["--focus"] },
})
