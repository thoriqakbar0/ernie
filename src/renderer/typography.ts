import { Schema } from "effect"

/** Local font stacks; unavailable faces fall back to the platform family. */
export const interfaceFonts = [
  {
    label: "System",
    stack: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    value: "system",
  },
  { label: "Geist", stack: '"Geist", system-ui, sans-serif', value: "geist" },
  {
    label: "Helvetica",
    stack: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    value: "helvetica",
  },
  { label: "Avenir", stack: "Avenir, system-ui, sans-serif", value: "avenir" },
  { label: "Verdana", stack: "Verdana, sans-serif", value: "verdana" },
  { label: "Trebuchet MS", stack: '"Trebuchet MS", sans-serif', value: "trebuchet" },
  { label: "Palatino", stack: "Palatino, Georgia, serif", value: "palatino" },
  { label: "Georgia", stack: 'Georgia, "Times New Roman", serif', value: "georgia" },
] as const
/** Monospace choices for source, inline code, and file paths. */
export const monoFonts = [
  {
    label: "System mono",
    stack: "ui-monospace, SFMono-Regular, Menlo, monospace",
    value: "system",
  },
  { label: "Menlo", stack: "Menlo, ui-monospace, monospace", value: "menlo" },
  { label: "Monaco", stack: "Monaco, ui-monospace, monospace", value: "monaco" },
  { label: "Consolas", stack: "Consolas, ui-monospace, monospace", value: "consolas" },
  { label: "Andale Mono", stack: '"Andale Mono", monospace', value: "andale" },
  { label: "SF Mono", stack: '"SF Mono", SFMono-Regular, monospace', value: "sfmono" },
  { label: "Courier New", stack: '"Courier New", Courier, monospace', value: "courier" },
] as const
const Typography = Schema.Struct({
  font: Schema.Literals(interfaceFonts.map((font) => font.value)),
  mono: Schema.Literals(monoFonts.map((font) => font.value)),
})
/** Validated, independently selectable interface and code fonts. */
export type TypographyPreference = typeof Typography.Type
const parse = Schema.decodeUnknownOption(Schema.fromJsonString(Typography))
const key = "ernie:typography:v1"
/** Read local typography; malformed or unavailable storage uses the original font stacks. */
export const readTypography = (): TypographyPreference => {
  try {
    const result = parse(localStorage.getItem(key))
    return result._tag === "Some" ? result.value : { font: "geist", mono: "system" }
  } catch {
    return { font: "geist", mono: "system" }
  }
}
/** Apply document variables, inherited by controls and portals. */
export const applyTypography = (value: TypographyPreference): void => {
  document.documentElement.style.setProperty(
    "--font-interface",
    interfaceFonts.find((font) => font.value === value.font)?.stack ?? interfaceFonts[0].stack,
  )
  document.documentElement.style.setProperty(
    "--font-mono",
    monoFonts.find((font) => font.value === value.mono)?.stack ?? monoFonts[0].stack,
  )
}
/** Apply immediately and report persistence failure without discarding the selection. */
export const saveTypography = (value: TypographyPreference): "saved" | "unavailable" => {
  applyTypography(value)
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return "saved"
  } catch {
    return "unavailable"
  }
}
