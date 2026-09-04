import * as stylex from "@stylexjs/stylex"

// @lat: [[styling#Style the renderer#Component styles]]
/** Shared light and dark colors also reach portal content. */
export const theme = stylex.defineVars({
  "--canvas": {
    default: "#fdfbf9",
    "@media (prefers-color-scheme: dark)": "#171310",
  },
  "--paper": {
    default: "var(--canvas)",
    "@media (prefers-color-scheme: dark)": "var(--canvas)",
  },
  "--surface": {
    default: "#fffaf5",
    "@media (prefers-color-scheme: dark)": "#211b17",
  },
  "--surface-muted": {
    default: "#f7efe9",
    "@media (prefers-color-scheme: dark)": "#2b231e",
  },
  "--surface-strong": {
    default: "#efe3da",
    "@media (prefers-color-scheme: dark)": "#392e27",
  },
  "--ink": {
    default: "#171717",
    "@media (prefers-color-scheme: dark)": "#f8f1eb",
  },
  "--ink-strong": {
    default: "#2b1a07",
    "@media (prefers-color-scheme: dark)": "#fffaf5",
  },
  "--muted": {
    default: "#6f655d",
    "@media (prefers-color-scheme: dark)": "#c1b4aa",
  },
  "--faint": {
    default: "#8d8178",
    "@media (prefers-color-scheme: dark)": "#978980",
  },
  "--rule": {
    default: "#ded5ce",
    "@media (prefers-color-scheme: dark)": "#44372f",
  },
  "--rule-strong": {
    default: "#c9bbb1",
    "@media (prefers-color-scheme: dark)": "#635044",
  },
  "--accent": {
    default: "#ff6f1e",
    "@media (prefers-color-scheme: dark)": "#ff8d4d",
  },
  "--accent-hover": {
    default: "#ce500a",
    "@media (prefers-color-scheme: dark)": "#ff6f1e",
  },
  "--focus": {
    default: "#ce500a",
    "@media (prefers-color-scheme: dark)": "#ff8d4d",
  },
  "--focus-soft": {
    default: "#ffe1cf",
    "@media (prefers-color-scheme: dark)": "#4b2a18",
  },
  "--success": {
    default: "#247154",
    "@media (prefers-color-scheme: dark)": "#76d5ad",
  },
  "--warning": {
    default: "#956012",
    "@media (prefers-color-scheme: dark)": "#f1bd69",
  },
  "--warning-soft": {
    default: "#f8e9c9",
    "@media (prefers-color-scheme: dark)": "#45361f",
  },
  "--danger": {
    default: "#a63a32",
    "@media (prefers-color-scheme: dark)": "#ff8a84",
  },
  "--danger-soft": {
    default: "#f7dddd",
    "@media (prefers-color-scheme: dark)": "#48262e",
  },
  "--shadow-composer": {
    default: "0 18px 48px -28px rgb(43 26 7 / 0.28), 0 5px 16px -10px rgb(43 26 7 / 0.14)",
    "@media (prefers-color-scheme: dark)":
      "0 18px 48px -24px rgb(0 0 0 / 0.62), 0 5px 18px -10px rgb(0 0 0 / 0.5)",
  },
  "--radius": "9px",
})
