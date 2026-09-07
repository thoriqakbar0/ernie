import { Schema } from "effect"

const Mode = Schema.Literals(["system", "light", "dark"])
/** The saved preference; system delegates resolution to CSS. */
export type AppearanceMode = typeof Mode.Type
const parseMode = Schema.decodeUnknownOption(Mode)
const storageKey = "ernie:appearance:v1"

/** Read persisted appearance, falling back to system when storage is unavailable or invalid. */
export function readAppearance(): AppearanceMode {
  try {
    const parsed = parseMode(localStorage.getItem(storageKey))
    return parsed._tag === "Some" ? parsed.value : "system"
  } catch { return "system" }
}

/** Apply to the document so portals and native controls inherit the same mode. */
export function applyAppearance(mode: AppearanceMode): void {
  document.documentElement.dataset.appearance = mode
  document.documentElement.style.colorScheme = mode === "system" ? "light dark" : mode
}

// @lat: [[styling#Style the renderer#Saved appearance]]
/** Apply immediately and report whether the preference was persisted. */
export function saveAppearance(mode: AppearanceMode): "saved" | "unavailable" {
  applyAppearance(mode)
  try {
    localStorage.setItem(storageKey, mode)
    return "saved"
  } catch { return "unavailable" }
}

const Palette = Schema.Literals(["mono", "ernie", "sage", "ocean", "rose", "lavender", "amber", "mint", "slate", "sand"])
/** Built-in palettes preserve semantic status colors. */
export type ThemePalette = typeof Palette.Type
const parsePalette = Schema.decodeUnknownOption(Palette)
export const palettes = [{ value: "mono", label: "Black & white" }, { value: "ernie", label: "Ernie" }, { value: "sage", label: "Sage" }, { value: "ocean", label: "Ocean" }, { value: "rose", label: "Rose" }, { value: "lavender", label: "Lavender" }, { value: "amber", label: "Amber" }, { value: "mint", label: "Mint" }, { value: "slate", label: "Slate" }, { value: "sand", label: "Sand" }] as const
const paletteKey = "ernie:palette:v1"
const paletteTokens = {
  mono: {"--canvas": "light-dark(#ffffff, #141414)", "--surface": "light-dark(#ffffff, #1b1b1b)", "--surface-muted": "light-dark(#f2f2f2, #202020)", "--surface-strong": "light-dark(#e4e4e4, #363636)", "--accent": "light-dark(#171717, #f5f5f5)", "--accent-hover": "light-dark(#333333, #dddddd)", "--on-accent": "light-dark(#ffffff, #171717)", "--focus": "light-dark(#444444, #f5f5f5)", "--focus-soft": "light-dark(#f2f2f2, #202020)", "--ink": "light-dark(#171717, #f5f5f5)", "--ink-strong": "light-dark(#111111, #ffffff)", "--muted": "light-dark(#606060, #bdbdbd)", "--faint": "light-dark(#707070, #aaaaaa)", "--rule": "light-dark(#dddddd, #404040)", "--rule-strong": "light-dark(#bbbbbb, #606060)"},
  rose: {"--canvas": "light-dark(#fcf0f3, #141414)", "--surface": "light-dark(#ffffff, #1b1b1b)", "--surface-muted": "light-dark(#fcf0f3, #302027)", "--surface-strong": "light-dark(#e4e4e4, #363636)", "--accent": "light-dark(#f1a7bb, #f1a7bb)", "--accent-hover": "light-dark(#e895ad, #e895ad)", "--on-accent": "#171717", "--focus": "light-dark(#444444, #f1a7bb)", "--focus-soft": "light-dark(#fcf0f3, #302027)"},
  lavender: {"--canvas": "light-dark(#f3f0fc, #141414)", "--surface": "light-dark(#ffffff, #1b1b1b)", "--surface-muted": "light-dark(#f3f0fc, #282335)", "--surface-strong": "light-dark(#e4e4e4, #363636)", "--accent": "light-dark(#bca8ef, #bca8ef)", "--accent-hover": "light-dark(#aa94df, #aa94df)", "--on-accent": "#171717", "--focus": "light-dark(#444444, #bca8ef)", "--focus-soft": "light-dark(#f3f0fc, #282335)"},
  amber: {"--canvas": "light-dark(#fcf6e9, #141414)", "--surface": "light-dark(#ffffff, #1b1b1b)", "--surface-muted": "light-dark(#fcf6e9, #30281b)", "--surface-strong": "light-dark(#e4e4e4, #363636)", "--accent": "light-dark(#edc477, #edc477)", "--accent-hover": "light-dark(#deb361, #deb361)", "--on-accent": "#171717", "--focus": "light-dark(#444444, #edc477)", "--focus-soft": "light-dark(#fcf6e9, #30281b)"},
  mint: {"--canvas": "light-dark(#eef9f5, #141414)", "--surface": "light-dark(#ffffff, #1b1b1b)", "--surface-muted": "light-dark(#eef9f5, #1c302a)", "--surface-strong": "light-dark(#e4e4e4, #363636)", "--accent": "light-dark(#8ed2bc, #8ed2bc)", "--accent-hover": "light-dark(#78bfa7, #78bfa7)", "--on-accent": "#171717", "--focus": "light-dark(#444444, #8ed2bc)", "--focus-soft": "light-dark(#eef9f5, #1c302a)"},
  slate: {"--canvas": "light-dark(#f0f3f7, #141414)", "--surface": "light-dark(#ffffff, #1b1b1b)", "--surface-muted": "light-dark(#f0f3f7, #232a34)", "--surface-strong": "light-dark(#e4e4e4, #363636)", "--accent": "light-dark(#a8b6c9, #a8b6c9)", "--accent-hover": "light-dark(#94a5bc, #94a5bc)", "--on-accent": "#171717", "--focus": "light-dark(#444444, #a8b6c9)", "--focus-soft": "light-dark(#f0f3f7, #232a34)"},
  sand: {"--canvas": "light-dark(#f8f3ec, #141414)", "--surface": "light-dark(#ffffff, #1b1b1b)", "--surface-muted": "light-dark(#f8f3ec, #30281f)", "--surface-strong": "light-dark(#e4e4e4, #363636)", "--accent": "light-dark(#d3b697, #d3b697)", "--accent-hover": "light-dark(#c2a484, #c2a484)", "--on-accent": "#171717", "--focus": "light-dark(#444444, #d3b697)", "--focus-soft": "light-dark(#f8f3ec, #30281f)"},

  sage: { "--canvas": "light-dark(#f7f9f4, #131914)", "--surface": "light-dark(#fcfdf8, #1b251d)", "--surface-muted": "light-dark(#eaf0e5, #26332a)", "--surface-strong": "light-dark(#dce6d5, #344638)", "--accent": "light-dark(#9bbd82, #a6cc8d)", "--accent-hover": "light-dark(#88aa70, #b7daa1)", "--on-accent": "#172312", "--focus": "light-dark(#466c32, #a6cc8d)", "--focus-soft": "light-dark(#dceacd, #30452a)" },
  ocean: { "--canvas": "light-dark(#f5f8fc, #11171e)", "--surface": "light-dark(#fafdff, #1a2531)", "--surface-muted": "light-dark(#e7eef7, #253447)", "--surface-strong": "light-dark(#d6e2f0, #34485f)", "--accent": "light-dark(#85b9ed, #9fcafa)", "--accent-hover": "light-dark(#70a8df, #b4d7fc)", "--on-accent": "#11283f", "--focus": "light-dark(#32699e, #9fcafa)", "--focus-soft": "light-dark(#d5e7fa, #294561)" },
}

/** Read the palette independently from light/dark mode, with black and white as fallback. */
export function readPalette(): ThemePalette {
  try {
    const parsed = parsePalette(localStorage.getItem(paletteKey))
    return parsed._tag === "Some" ? parsed.value : "mono"
  } catch { return "mono" }
}

/** Apply palette overrides at the document boundary, including portal content. */
export function applyPalette(palette: ThemePalette): void {
  for (const key of new Set(Object.values(paletteTokens).flatMap(tokens => Object.keys(tokens)))) document.documentElement.style.removeProperty(key)
  if (palette === "ernie") return
  for (const [key, value] of Object.entries(paletteTokens[palette])) document.documentElement.style.setProperty(key, value)
}

/** Apply a palette immediately; return a recoverable persistence outcome. */
export function savePalette(palette: ThemePalette): "saved" | "unavailable" {
  applyPalette(palette)
  try { localStorage.setItem(paletteKey, palette); return "saved" }
  catch { return "unavailable" }
}
