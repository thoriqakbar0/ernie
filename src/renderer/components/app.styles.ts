import * as stylex from "@stylexjs/stylex"
import { theme } from "../theme.stylex"

/** Styles owned by this surface, including its responsive and interaction states. */
export const styles = stylex.create({
  appMain: {
    display: "grid",
    flex: "1",
    gridTemplateColumns: {
      "@media (max-width: 720px)": "minmax(0, 1fr)",
      "@media (max-width: 900px)": "228px minmax(0, 1fr)",
      default: "272px minmax(0, 1fr)",
    },
    gridTemplateRows: {
      "@media (max-width: 480px)": "minmax(0, 1fr)",
      "@media (max-width: 720px)": "minmax(0, 1fr)",
      default: null,
    },
    minHeight: "0",
    minWidth: "0",
    position: "relative",
  },
  appMainSidebarClosed: {
    gridTemplateColumns: "minmax(0, 1fr)",
    gridTemplateRows: {
      "@media (max-width: 720px)": "minmax(0, 1fr)",
      default: null,
    },
  },
  appShell: {
    backgroundColor: theme["--paper"],
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minWidth: "0",
    overflow: "hidden",
  },
  appSidebarSlot: {
    "@media (prefers-reduced-motion: reduce)": { transition: "opacity 120ms ease-out" },
    backgroundColor: theme["--surface-muted"],
    borderBottomColor: {
      "@media (max-width: 720px)": theme["--rule"],
      default: null,
    },
    borderBottomStyle: {
      "@media (max-width: 720px)": "solid",
      default: null,
    },
    borderBottomWidth: {
      "@media (max-width: 720px)": "1px",
      default: null,
    },
    borderRightColor: theme["--rule"],
    borderRightStyle: {
      "@media (max-width: 720px)": "solid",
      default: "solid",
    },
    borderRightWidth: {
      "@media (max-width: 720px)": "0",
      default: "1px",
    },
    insetBlock: 0,
    insetInlineStart: 0,
    minHeight: "0",
    minWidth: "0",
    opacity: 1,
    position: "absolute",
    transform: "translateX(0)",
    transition:
      "transform 240ms cubic-bezier(0.23, 1, 0.32, 1), opacity 180ms ease-out, visibility 0s",
    visibility: "visible",
    width: { "@media (max-width: 720px)": "100%", "@media (max-width: 900px)": 228, default: 272 },
    zIndex: 21,
  },
  conversationPage: {
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
  },
  openIcon: {
    width: "16px",
  },
  pageHidden: { display: "none" },
  sidebarLeaving: {
    "@media (prefers-reduced-motion: reduce)": {
      transform: "none",
      transition: "opacity 120ms ease-out, visibility 0s 120ms",
    },
    opacity: 0,
    transform: "translateX(-100%)",
    transition:
      "transform 240ms cubic-bezier(0.23, 1, 0.32, 1), opacity 180ms ease-out, visibility 0s 240ms",
    visibility: "hidden",
  },
  sidebarOpenButton: {
    WebkitAppRegion: "no-drag",
    backgroundColor: {
      ":hover": theme["--surface-muted"],
      default: theme["--surface"],
    },
    borderRadius: "9px",
    borderStyle: "solid",
    borderWidth: "0",
    color: {
      ":hover": theme["--ink-strong"],
      default: theme["--muted"],
    },
    cursor: "pointer",
    display: "grid",
    height: "44px",
    insetBlockStart: "32px",
    insetInlineStart: "8px",
    placeItems: "center",
    position: "absolute",
    scale: {
      ":active": "0.96",
      default: null,
    },
    transitionDuration: "120ms",
    transitionProperty: "background-color, color, scale",
    transitionTimingFunction: "ease-out",
    width: "44px",
    zIndex: "20",
  },
  skipLink: {
    backgroundColor: theme["--ink-strong"],
    borderRadius: "8px",
    color: theme["--surface"],
    fontSize: "13px",
    fontWeight: "700",
    left: "12px",
    padding: "8px 12px",
    position: "fixed",
    top: "8px",
    transform: {
      ":focus": "translateY(0)",
      default: "translateY(-160%)",
    },
    transition: "transform 140ms ease-out",
    zIndex: "1000",
  },
  viewFill: {
    height: "100%",
    width: "100%",
  },
  workspaceBehindSidebar: {
    display: { "@media (max-width: 720px)": "none", default: "grid" },
    gridColumn: { "@media (max-width: 720px)": 1, default: 2 },
  },
  workspaceSlot: {
    backgroundColor: theme["--surface"],
    display: "grid",
    gridTemplateRows: "minmax(0, 1fr)",
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
  },
})
