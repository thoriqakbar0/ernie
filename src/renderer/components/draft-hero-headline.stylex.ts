import * as stylex from "@stylexjs/stylex"

/** Styles owned by the draft-hero-headline component. */
export const styles = stylex.create({
  borderB: {"borderBottomWidth":1,"borderBottomStyle":"solid"},
  borderDotted: {"borderStyle":"dotted"},
  borderZinc50070: {"borderColor":"color-mix(in srgb, #71717a 70%, transparent)"},
  darkTextZinc100: {"@media (prefers-color-scheme: dark)":{"color":"#f4f4f5"}},
  fontNormal: {"fontWeight":400},
  maxW5xl: {"maxWidth":"64rem"},
  mxAuto: {"marginInline":"auto"},
  smText3xl: {"@media (min-width: 640px)":{"fontSize":"1.875rem","lineHeight":"2.25rem"}},
  text2xl: {"fontSize":"1.5rem","lineHeight":"2rem"},
  textCenter: {"textAlign":"center"},
  textZinc900: {"color":"#18181b"},
  trackingTight: {"letterSpacing":"-0.025em"},
  wFull: {"width":"100%"},
})
