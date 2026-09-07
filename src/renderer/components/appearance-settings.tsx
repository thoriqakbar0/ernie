import { useState } from "react"
import * as stylex from "@stylexjs/stylex"
import { readAppearance, saveAppearance, readPalette, savePalette, palettes } from "../appearance"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { interfaceFonts, monoFonts, readTypography, saveTypography } from "../typography"
import { styles } from "./app-settings.styles"

/** Local appearance controls apply immediately and retain an honest save status. */
export function AppearanceSettings() {
  const [typography, setTypography] = useState(readTypography)
  const [fontStatus, setFontStatus] = useState<"saved" | "unavailable">("saved")
  const [palette, setPalette] = useState(readPalette)
  const [mode, setMode] = useState(readAppearance)
  const [status, setStatus] = useState<"saved" | "unavailable">("saved")
  return <section aria-labelledby="appearance-heading" {...stylex.props(styles.appearance)}>
    <h2 id="appearance-heading" {...stylex.props(styles.scopeTitle)}>Appearance</h2>
    <div {...stylex.props(styles.appearanceRows)}>
    <div {...stylex.props(styles.appearanceRow)}>
    <div><h3 {...stylex.props(styles.appearanceLabel)}>Theme</h3><p {...stylex.props(styles.appearanceHint)}>Choose your palette.</p></div>
    <Select value={palette} onValueChange={value => {
      const option = palettes.find(palette => palette.value === value)
      if (!option) return
      setPalette(option.value)
      setStatus(savePalette(option.value))
    }}>
      <SelectTrigger aria-label="Theme palette" xstyle={styles.appearanceSelect}><SelectValue>{palettes.find(option => option.value === palette)?.label}</SelectValue></SelectTrigger>
      <SelectContent>{palettes.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
    </Select>
    </div>
    <div {...stylex.props(styles.appearanceRow)}>
    <div><h3 id="color-mode-heading" {...stylex.props(styles.appearanceLabel)}>Color mode</h3><p {...stylex.props(styles.appearanceHint)}>Light, dark, or match your device.</p></div>
    <Select value={mode} onValueChange={value => {
      if (value !== "system" && value !== "light" && value !== "dark") return
      setMode(value)
      setStatus(saveAppearance(value))
    }}>
      <SelectTrigger aria-labelledby="color-mode-heading" xstyle={styles.appearanceSelect}><SelectValue>{mode === "system" ? "System" : mode === "light" ? "Light" : "Dark"}</SelectValue></SelectTrigger>
      <SelectContent><SelectItem value="system">System</SelectItem><SelectItem value="light">Light</SelectItem><SelectItem value="dark">Dark</SelectItem></SelectContent>
    </Select>
    </div>
    <div {...stylex.props(styles.appearanceRow)}>
    <h3 id="interface-font-heading" {...stylex.props(styles.appearanceLabel)}>Interface font</h3>
    <Select value={typography.font} onValueChange={value => {
      const option = interfaceFonts.find(font => font.value === value)
      if (!option) return
      const next = { ...typography, font: option.value }; setTypography(next); setFontStatus(saveTypography(next))
    }}>
      <SelectTrigger aria-labelledby="interface-font-heading" xstyle={styles.appearanceSelect}><SelectValue>{interfaceFonts.find(font => font.value === typography.font)?.label}</SelectValue></SelectTrigger>
      <SelectContent>{interfaceFonts.map(font => <SelectItem key={font.value} value={font.value}>{font.label}</SelectItem>)}</SelectContent>
    </Select>
    <p {...stylex.props(styles.fontPreview)}>The quick brown fox jumps over the lazy dog.</p>
    </div>
    <div {...stylex.props(styles.appearanceRow)}>
    <h3 id="mono-font-heading" {...stylex.props(styles.appearanceLabel)}>Monospace font</h3>
    <Select value={typography.mono} onValueChange={value => {
      const option = monoFonts.find(font => font.value === value)
      if (!option) return
      const next = { ...typography, mono: option.value }; setTypography(next); setFontStatus(saveTypography(next))
    }}>
      <SelectTrigger aria-labelledby="mono-font-heading" xstyle={styles.appearanceSelect}><SelectValue>{monoFonts.find(font => font.value === typography.mono)?.label}</SelectValue></SelectTrigger>
      <SelectContent>{monoFonts.map(font => <SelectItem key={font.value} value={font.value}>{font.label}</SelectItem>)}</SelectContent>
    </Select>
    <pre {...stylex.props(styles.fontPreview, styles.monoPreview)}>const greeting = "Hello, Ernie";
0123456789 · Il1 O0</pre>
    </div>
    </div>
    {fontStatus === "unavailable" ? <p role="alert">Font applied but not saved. Choose a font to retry.</p> : null}
    {status === "unavailable" ? <p role="alert">Theme applied but not saved. Select the theme or mode again to retry.</p> : null}
  </section>
}
