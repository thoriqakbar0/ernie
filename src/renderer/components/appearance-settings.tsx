import { useState } from "react"
import * as stylex from "@stylexjs/stylex"
import { readAppearance, saveAppearance, readPalette, savePalette, palettes } from "../appearance"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { interfaceFonts, monoFonts, readTypography, saveTypography } from "../typography"
import { CheckpointSource } from "./checkpoint-source"
import { styles } from "./app-settings.styles"

/** Local appearance controls apply immediately and retain an honest save status. */
export const AppearanceSettings = () => {
  const [typography, setTypography] = useState(readTypography)
  const [fontStatus, setFontStatus] = useState<"saved" | "unavailable" | "unchanged">("unchanged")
  const [palette, setPalette] = useState(readPalette)
  const [mode, setMode] = useState(readAppearance)
  const [saveStatus, setSaveStatus] = useState({ mode: "unchanged", palette: "unchanged" })
  let modeLabel = "Dark"
  if (mode === "system") {
    modeLabel = "System"
  } else if (mode === "light") {
    modeLabel = "Light"
  }
  return (
    <section
      data-ernie-scope="local-appearance"
      aria-describedby="appearance-scope"
      aria-labelledby="appearance-heading"
      {...stylex.props(styles.appearance)}
    >
      <h2 id="appearance-heading" {...stylex.props(styles.scopeTitle)}>
        Appearance
      </h2>
      <p id="appearance-scope" {...stylex.props(styles.description)}>
        Saved on this device. Appearance changes aren’t included in App history.
      </p>
      <div {...stylex.props(styles.appearanceRows)}>
        <div {...stylex.props(styles.appearanceRow)}>
          <div>
            <h3 {...stylex.props(styles.appearanceLabel)}>Theme</h3>
          </div>
          <Select
            value={palette}
            onValueChange={(value) => {
              const option = palettes.find((candidate) => candidate.value === value)
              if (!option) {
                return
              }
              setPalette(option.value)
              const result = savePalette(option.value)
              setSaveStatus((previous) => ({ ...previous, palette: result }))
            }}
          >
            <SelectTrigger aria-label="Theme palette" xstyle={styles.appearanceSelect}>
              <SelectValue>
                {palettes.find((option) => option.value === palette)?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {palettes.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div {...stylex.props(styles.appearanceRow)}>
          <div>
            <h3 id="color-mode-heading" {...stylex.props(styles.appearanceLabel)}>
              Color mode
            </h3>
          </div>
          <Select
            value={mode}
            onValueChange={(value) => {
              if (value !== "system" && value !== "light" && value !== "dark") {
                return
              }
              setMode(value)
              const result = saveAppearance(value)
              setSaveStatus((previous) => ({ ...previous, mode: result }))
            }}
          >
            <SelectTrigger aria-labelledby="color-mode-heading" xstyle={styles.appearanceSelect}>
              <SelectValue>{modeLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system">System</SelectItem>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div {...stylex.props(styles.appearanceRow)}>
          <h3 id="interface-font-heading" {...stylex.props(styles.appearanceLabel)}>
            Interface font
          </h3>
          <Select
            value={typography.font}
            onValueChange={(value) => {
              const option = interfaceFonts.find((font) => font.value === value)
              if (!option) {
                return
              }
              const next = { ...typography, font: option.value }
              setTypography(next)
              setFontStatus(saveTypography(next))
            }}
          >
            <SelectTrigger
              aria-labelledby="interface-font-heading"
              xstyle={styles.appearanceSelect}
            >
              <SelectValue>
                {interfaceFonts.find((font) => font.value === typography.font)?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {interfaceFonts.map((font) => (
                <SelectItem key={font.value} value={font.value}>
                  {font.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p {...stylex.props(styles.fontPreview)}>The quick brown fox jumps over the lazy dog.</p>
        </div>
        <div {...stylex.props(styles.appearanceRow)}>
          <h3 id="mono-font-heading" {...stylex.props(styles.appearanceLabel)}>
            Monospace font
          </h3>
          <Select
            value={typography.mono}
            onValueChange={(value) => {
              const option = monoFonts.find((font) => font.value === value)
              if (!option) {
                return
              }
              const next = { ...typography, mono: option.value }
              setTypography(next)
              setFontStatus(saveTypography(next))
            }}
          >
            <SelectTrigger aria-labelledby="mono-font-heading" xstyle={styles.appearanceSelect}>
              <SelectValue>
                {monoFonts.find((font) => font.value === typography.mono)?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {monoFonts.map((font) => (
                <SelectItem key={font.value} value={font.value}>
                  {font.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <pre {...stylex.props(styles.fontPreview, styles.monoPreview)}>
            <CheckpointSource
              language="javascript"
              source={'const greeting = "Hello, Ernie";\n// 0123456789 · Il1 O0'}
            />
          </pre>
        </div>
      </div>
      <output aria-live="polite" {...stylex.props(styles.description)}>
        {saveStatus.palette === "saved"
          ? `Palette ${palettes.find((option) => option.value === palette)?.label} applied and saved. `
          : ""}
        {saveStatus.mode === "saved" ? `Color mode ${mode} applied and saved. ` : ""}
        {fontStatus === "saved"
          ? "Font preferences applied and saved. Installed fonts determine the displayed face."
          : ""}
      </output>
      {fontStatus === "unavailable" ? (
        <p role="alert">Fonts applied for this visit but could not be saved.</p>
      ) : null}
      {saveStatus.palette === "unavailable" || saveStatus.mode === "unavailable" ? (
        <p role="alert">Theme preferences applied for this visit but could not be saved.</p>
      ) : null}
      {fontStatus === "unavailable" ||
      saveStatus.palette === "unavailable" ||
      saveStatus.mode === "unavailable" ? (
        <button
          type="button"
          {...stylex.props(styles.button)}
          onClick={() => {
            if (fontStatus === "unavailable") {
              setFontStatus(saveTypography(typography))
            }
            const paletteResult =
              saveStatus.palette === "unavailable" ? savePalette(palette) : saveStatus.palette
            const modeResult =
              saveStatus.mode === "unavailable" ? saveAppearance(mode) : saveStatus.mode
            setSaveStatus({ mode: modeResult, palette: paletteResult })
          }}
        >
          Retry saving preferences
        </button>
      ) : null}
    </section>
  )
}
