import * as stylex from "@stylexjs/stylex"

/** Styles owned by this surface, including its responsive and interaction states. */
export const styles = stylex.create({
  controlIcon: {
    width: "16px",
    height: "16px",
    flex: "0 0 auto",
  },
  primeComposer: {
    width: "min(100%, 720px)",
    margin: "0 auto",
    pointerEvents: "auto",
  },
  primeComposerHero: {
    width: "min(100%, 719px)",
  },
  composerGroup: {
    borderColor: {
      default: "transparent",
      ':has([data-slot="input-group-control"]:focus-visible)': "transparent",
    },
    boxShadow: {
      default: null,
      ':has([data-slot="input-group-control"]:focus-visible)': "none",
    },
    outlineStyle: {
      default: null,
      ':has([data-slot="input-group-control"]:focus-visible)': "none",
    },
  },
  srOnly: {
    position: "absolute",
    width: "1px",
    height: "1px",
    padding: "0",
    margin: "-1px",
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    whiteSpace: "nowrap",
    borderWidth: "0",
    borderStyle: "solid",
  },
  composerControl: {
    boxShadow: {
      default: null,
      ":focus": "none",
      ":focus-visible": "none",
    },
    outlineStyle: {
      default: null,
      ":focus": "none",
      ":focus-visible": "none",
    },
  },
  composerField: {
    minHeight: 40,
    maxHeight: 160,
    overflowY: "auto",
  },
  composerAction: {
    marginLeft: "auto",
  },
})
