import * as stylex from "@stylexjs/stylex"

// @lat: [[styling#Style the renderer#Component styles]]
/** Shared light and dark colors also reach portal content. */
export const theme = stylex.defineVars({
  "--canvas": "var(--ernie-light, #fdfbf9) var(--ernie-dark, #171310)",
  "--paper": "var(--canvas)",
  "--surface": "var(--ernie-light, #fffaf5) var(--ernie-dark, #211b17)",
  "--surface-muted": "var(--ernie-light, #f7efe9) var(--ernie-dark, #2b231e)",
  "--surface-strong": "var(--ernie-light, #efe3da) var(--ernie-dark, #392e27)",
  "--ink": "var(--ernie-light, #171717) var(--ernie-dark, #f8f1eb)",
  "--ink-strong": "var(--ernie-light, #2b1a07) var(--ernie-dark, #fffaf5)",
  "--muted": "var(--ernie-light, #6f655d) var(--ernie-dark, #c1b4aa)",
  "--faint": "var(--ernie-light, #756b63) var(--ernie-dark, #a99a8f)",
  "--rule": "var(--ernie-light, #ded5ce) var(--ernie-dark, #44372f)",
  "--rule-strong": "var(--ernie-light, #c9bbb1) var(--ernie-dark, #635044)",
  "--accent": "var(--ernie-light, #ff6f1e) var(--ernie-dark, #ff8d4d)",
  "--accent-hover": "var(--ernie-light, #e65c0a) var(--ernie-dark, #ff6f1e)",
  "--on-accent": "#2b1a07",
  "--focus": "var(--ernie-light, #ce500a) var(--ernie-dark, #ff8d4d)",
  "--focus-soft": "var(--ernie-light, #ffe1cf) var(--ernie-dark, #4b2a18)",
  "--success-soft": "var(--ernie-light, #e5f3eb) var(--ernie-dark, #183c2d)",
  "--success": "var(--ernie-light, #247154) var(--ernie-dark, #76d5ad)",
  "--warning": "var(--ernie-light, #956012) var(--ernie-dark, #f1bd69)",
  "--warning-soft": "var(--ernie-light, #f8e9c9) var(--ernie-dark, #45361f)",
  "--danger": "var(--ernie-light, #a63a32) var(--ernie-dark, #ff8a84)",
  "--danger-soft": "var(--ernie-light, #f7dddd) var(--ernie-dark, #48262e)",
  "--shadow-composer": "0 18px 48px -28px var(--ernie-light, rgb(43 26 7 / 0.28)) var(--ernie-dark, rgb(0 0 0 / 0.62)), 0 5px 16px -10px var(--ernie-light, rgb(43 26 7 / 0.14)) var(--ernie-dark, rgb(0 0 0 / 0.5))",
  "--radius": "9px",
})
