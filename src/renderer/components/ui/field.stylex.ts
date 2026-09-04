import * as stylex from "@stylexjs/stylex"

/** Shared input geometry; native and Base UI state selectors are in primitives.css. */
export const styles = stylex.create({
  field: {
    width: "100%",
    minWidth: 0,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--input)",
    backgroundColor: "transparent",
    paddingInline: 10,
    fontSize: { default: "1rem", "@media (min-width: 768px)": "0.875rem" },
    lineHeight: { default: "1.5rem", "@media (min-width: 768px)": "1.25rem" },
    outline: "none",
    transitionProperty: "color, background-color, border-color, box-shadow",
    transitionDuration: "150ms",
    transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
  },
  input: { height: 32, paddingBlock: 4 },
  textarea: { display: "flex", fieldSizing: "content", minHeight: 64, paddingBlock: 8 },
  groupControl: {
    flex: 1,
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    boxShadow: "none",
  },
  groupTextarea: { resize: "none", paddingBlock: 8 },
})
