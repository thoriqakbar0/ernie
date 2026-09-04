import * as stylex from "@stylexjs/stylex"

/** Scroll containment and the floating jump-to-end button. */
export const styles = stylex.create({
  root: {
    position: "relative",
    display: "flex",
    width: "100%",
    height: "100%",
    minHeight: 0,
    overflow: "hidden",
  },
  viewport: { width: "100%", height: "100%", overflowY: "auto", overscrollBehavior: "contain" },
  content: { display: "flex", flexDirection: "column" },
  button: {
    position: "absolute",
    bottom: 16,
    left: "50%",
    zIndex: 10,
    transform: "translateX(-50%)",
    borderRadius: 9999,
    boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
  },
})
