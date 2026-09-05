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
      "@media (max-width: 720px)": "minmax(240px, 38vh) minmax(0, 1fr)",
      "@media (max-width: 480px)": "minmax(220px, 38vh) minmax(0, 1fr)",
    },
  },
  appMainSidebarClosed: {
    gridTemplateColumns: "minmax(0, 1fr)",
    gridTemplateRows: {
      default: null,
      "@media (max-width: 720px)": "minmax(0, 1fr)",
    },
  },
  appSidebarSlot: {
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
  viewFill: {
    height: "100%",
    width: "100%",
  },
  sidebarOpenButton: {
    display: "grid",
    width: "34px",
    height: "34px",
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
    top: "14px",
    left: "14px",
  },
  openIcon: {
    width: "16px",
  },
})
