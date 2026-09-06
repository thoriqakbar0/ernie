import * as stylex from "@stylexjs/stylex"
import { theme } from "../theme.stylex"

export const styles = stylex.create({
  welcome: { display: "grid", flex: 1, minHeight: 0, overflowY: "auto", alignContent: "safe center", padding: { default: "64px 56px", "@media (max-width: 720px)": "56px 24px" } },
  content: { width: "100%", maxWidth: 650, marginInline: "auto" },
  title: { margin: 0, fontFamily: '"gelica", Georgia, serif', fontWeight: 500, fontSize: "clamp(38px, 5vw, 68px)", lineHeight: 1.08, letterSpacing: "-0.045em", color: theme["--ink-strong"], textWrap: "balance" },
  emphasis: { fontStyle: "italic", color: theme["--focus"] },
  characters: { display: "flex", alignItems: "end", width: "fit-content", maxWidth: "100%", gap: { default: 12, "@media (max-width: 480px)": 0 }, marginBlock: "36px 28px", borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: theme["--rule-strong"], padding: "0 12px 12px" },
  character: { display: "inline-flex" },
  robot: { transform: "rotate(-8deg)" },
  eyes: { transform: "translateY(6px) rotate(5deg)" },
  coffee: { transform: "rotate(-5deg)" },
  star: { transform: "translateY(-10px) rotate(10deg)" },
  description: { maxWidth: "42ch", margin: "0 0 26px", color: theme["--muted"], fontSize: 16, lineHeight: 1.65, textWrap: "pretty" },
  action: { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 20, minHeight: 48, padding: "0 18px", borderRadius: 12, backgroundColor: theme["--accent"], color: theme["--on-accent"], fontSize: 14, fontWeight: 650, cursor: "pointer", boxShadow: "0 2px 0 rgb(43 26 7 / 0.18)" },
  note: { marginTop: 20, maxWidth: "44ch", fontSize: 12, lineHeight: 1.5, color: theme["--muted"] },
})
