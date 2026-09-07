import * as stylex from "@stylexjs/stylex"
import { theme } from "../theme.stylex"

/** Styles owned by this surface, including its responsive and interaction states. */
export const styles = stylex.create({
  appShell: {
    display: "flex",
    minWidth: "0",
    height: "100%",
    flexDirection: "column",
    backgroundColor: theme["--paper"],
    overflow: "hidden",
  },
  skipLink: {
    position: "fixed",
    top: "8px",
    left: "12px",
    zIndex: "1000",
    transform: {
      default: "translateY(-160%)",
      ":focus": "translateY(0)",
    },
    borderRadius: "8px",
    backgroundColor: theme["--ink-strong"],
    color: theme["--surface"],
    padding: "8px 12px",
    fontSize: "13px",
    fontWeight: "700",
    transition: "transform 140ms ease-out",
  },
  appMain: {
    position: "relative",
    display: "grid",
    minHeight: "0",
    minWidth: "0",
    flex: "1",
    gridTemplateColumns: {
      default: "272px minmax(0, 1fr)",
      "@media (max-width: 900px)": "228px minmax(0, 1fr)",
      "@media (max-width: 720px)": "minmax(0, 1fr)",
    },
    gridTemplateRows: {
      default: null,
      "@media (max-width: 720px)": "minmax(0, 1fr)",
      "@media (max-width: 480px)": "minmax(0, 1fr)",
    },
  },
  appMainSidebarClosed: {
    gridTemplateColumns: "minmax(0, 1fr)",
    gridTemplateRows: {
      default: null,
      "@media (max-width: 720px)": "minmax(0, 1fr)",
    },
  },
  workspaceSlot: { gridTemplateRows: "minmax(0, 1fr)", overflow: "hidden", backgroundColor: theme["--surface"], display: "grid", minWidth: 0, minHeight: 0 },
  workspaceBehindSidebar: { gridColumn: { default: 2, "@media (max-width: 720px)": 1 }, display: { default: "grid", "@media (max-width: 720px)": "none" } },
  sidebarLeaving: {
    transform: "translateX(-100%)",
    opacity: 0,
    visibility: "hidden",
    transition: "transform 240ms cubic-bezier(0.23, 1, 0.32, 1), opacity 180ms ease-out, visibility 0s 240ms",
    "@media (prefers-reduced-motion: reduce)": { transform: "none", transition: "opacity 120ms ease-out, visibility 0s 120ms" },
  },
  appSidebarSlot: {
    position: "absolute",
    insetBlock: 0,
    insetInlineStart: 0,
    width: { default: 272, "@media (max-width: 900px)": 228, "@media (max-width: 720px)": "100%" },
    zIndex: 21,
    backgroundColor: theme["--surface-muted"],
    transform: "translateX(0)",
    opacity: 1,
    visibility: "visible",
    transition: "transform 240ms cubic-bezier(0.23, 1, 0.32, 1), opacity 180ms ease-out, visibility 0s",
    "@media (prefers-reduced-motion: reduce)": { transition: "opacity 120ms ease-out" },

    minHeight: "0",
    minWidth: "0",
    borderRightWidth: {
      default: "1px",
      "@media (max-width: 720px)": "0",
    },
    borderRightStyle: {
      default: "solid",
      "@media (max-width: 720px)": "solid",
    },
    borderRightColor: theme["--rule"],
    borderBottomWidth: {
      default: null,
      "@media (max-width: 720px)": "1px",
    },
    borderBottomStyle: {
      default: null,
      "@media (max-width: 720px)": "solid",
    },
    borderBottomColor: {
      default: null,
      "@media (max-width: 720px)": theme["--rule"],
    },
  },
  conversationPage: { display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, overflow: "hidden" },
  pageHidden: { display: "none" },
  viewFill: {
    height: "100%",
    width: "100%",
  },
  sidebarOpenButton: {
    display: "grid",
    width: "44px",
    height: "44px",
    placeItems: "center",
    borderWidth: "0",
    borderStyle: "solid",
    borderRadius: "9px",
    backgroundColor: {
      default: theme["--surface"],
      ":hover": theme["--surface-muted"],
    },
    color: {
      default: theme["--muted"],
      ":hover": theme["--ink-strong"],
    },
    cursor: "pointer",
    transitionProperty: "background-color, color, scale",
    transitionDuration: "120ms",
    transitionTimingFunction: "ease-out",
    scale: {
      default: null,
      ":active": "0.96",
    },
    position: "absolute",
    zIndex: "20",
    insetBlockStart: "8px",
    insetInlineStart: "8px",
  },
  openIcon: {
    width: "16px",
  },
})
