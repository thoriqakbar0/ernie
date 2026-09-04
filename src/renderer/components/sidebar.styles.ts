import * as stylex from "@stylexjs/stylex"
import { theme } from "../theme.stylex"

/** Styles owned by this surface, including its responsive and interaction states. */
export const styles = stylex.create({
  sessionSidebar: {
    display: "flex",
    height: "100%",
    minWidth: "0",
    flexDirection: "column",
    backgroundColor: theme["--surface-muted"],
    color: theme["--ink"],
  },
  sidebarBrand: {
    WebkitAppRegion: "drag",
    display: "flex",
    minHeight: {
      default: "68px",
      "@media (max-width: 720px)": "44px",
    },
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    padding: {
      default: "14px 14px 12px 16px",
      "@media (max-width: 720px)": "6px 12px",
    },
    borderWidth: 0,
  },
  sidebarBrandIdentity: {
    display: "flex",
    minWidth: "0",
    alignItems: "center",
    gap: {
      default: "10px",
      "@media (max-width: 480px)": "6px",
    },
  },
  sidebarBrandMark: {
    width: {
      default: "34px",
      "@media (max-width: 720px)": "28px",
      "@media (max-width: 480px)": "24px",
    },
    height: {
      default: "34px",
      "@media (max-width: 720px)": "28px",
      "@media (max-width: 480px)": "24px",
    },
    flex: "0 0 auto",
    color: theme["--ink"],
  },
  sidebarBrandName: {
    margin: "0",
    fontSize: {
      default: "15px",
      "@media (max-width: 480px)": "13px",
    },
    fontWeight: "760",
    letterSpacing: "-0.02em",
    display: {
      default: null,
      "@media (max-width: 720px)": "block",
    },
  },
  sidebarBrandActions: {
    WebkitAppRegion: "no-drag",
    display: "flex",
    alignItems: "center",
    gap: "2px",
    borderRadius: "12px",
    backgroundColor: theme["--surface"],
    padding: "3px",
    boxShadow: "0 0 0 1px oklch(1 0 0 / 0.08),\n    0 2px 5px rgb(43 26 7 / 0.12)",
  },
  sidebarCloseButton: {
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
  },
  closeIcon: {
    width: "16px",
  },
  newSessionButton: {
    WebkitAppRegion: "no-drag",
    display: "grid",
    width: {
      default: "34px",
      "@media (max-width: 720px)": "34px",
      "@media (max-width: 480px)": "34px",
    },
    height: {
      default: "34px",
      "@media (max-width: 720px)": "34px",
      "@media (max-width: 480px)": "34px",
    },
    flex: "0 0 auto",
    placeItems: "center",
    borderWidth: "0",
    borderStyle: "solid",
    borderRadius: "9px",
    backgroundColor: {
      default: theme["--accent"],
      ":hover:not(:disabled)": theme["--accent-hover"],
    },
    color: "white",
    cursor: "pointer",
    transitionProperty: "background-color, box-shadow, scale",
    transitionDuration: "120ms",
    transitionTimingFunction: "ease-out",
    scale: {
      default: null,
      ":active:not(:disabled)": "0.96",
    },
    boxShadow: {
      default: null,
      ":hover:not(:disabled)": "0 2px 7px color-mix(in srgb, var(--accent) 35%, transparent)",
    },
    opacity: {
      default: null,
      ":disabled": "0.55",
    },
  },
  sessionCreationFeedback: {
    display: {
      default: null,
      ":empty": "none",
    },
  },
  creationMessage: {
    margin: "0 8px 10px",
    borderRadius: "8px",
    backgroundColor: {
      default: theme["--surface"],
      ':is([role="alert"])': theme["--danger-soft"],
    },
    padding: "8px 9px",
    color: {
      default: theme["--muted"],
      ':is([role="alert"])': theme["--danger"],
    },
    fontSize: "11px",
    lineHeight: "1.45",
  },
  sidebarNav: {
    minHeight: "0",
    flex: "1",
    overflowY: {
      default: "hidden",
      "@media (max-width: 720px)": "hidden",
    },
    padding: {
      default: "0 10px 12px",
      "@media (max-width: 720px)": "0 10px 8px",
    },
    display: {
      default: "flex",
      "@media (max-width: 720px)": "flex",
    },
    flexDirection: "column",
    overflow: {
      default: "hidden",
      "@media (max-width: 720px)": "hidden",
    },
    minWidth: {
      default: null,
      "@media (max-width: 720px)": "0",
    },
    alignItems: {
      default: null,
      "@media (max-width: 720px)": "stretch",
    },
    overflowX: {
      default: null,
      "@media (max-width: 720px)": "auto",
    },
  },
  agentSidebarTools: {
    flexShrink: "0",
    padding: "0 2px 10px",
    backgroundColor: theme["--surface-muted"],
    display: {
      default: null,
      "@media (max-width: 720px)": "flex",
    },
    alignItems: {
      default: null,
      "@media (max-width: 720px)": "center",
    },
    gap: {
      default: null,
      "@media (max-width: 720px)": "8px",
    },
    paddingBottom: {
      default: null,
      "@media (max-width: 720px)": "6px",
    },
  },
  sidebarSearch: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    minHeight: "38px",
    padding: "0 9px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: {
      default: theme["--rule"],
      ":focus-within": theme["--focus"],
    },
    borderRadius: "9px",
    backgroundColor: theme["--surface"],
    boxShadow: {
      default: null,
      ":focus-within": "0 0 0 2px var(--focus-soft)",
    },
    flex: {
      default: null,
      "@media (max-width: 720px)": "1",
    },
    minWidth: {
      default: null,
      "@media (max-width: 720px)": "0",
    },
  },
  searchIcon: {
    flex: "0 0 14px",
    width: "14px",
    color: theme["--muted"],
  },
  searchInput: {
    width: "100%",
    minWidth: "0",
    borderWidth: "0",
    borderStyle: "solid",
    backgroundColor: "transparent",
    color: theme["--ink"],
    fontSize: "12px",
    outlineStyle: "none",
    "::-webkit-search-cancel-button": {
      display: "none",
    },
  },
  clearSearchButton: {
    display: "grid",
    placeItems: "center",
    flex: "0 0 28px",
    height: "32px",
    borderWidth: "0",
    borderStyle: "solid",
    backgroundColor: "transparent",
    color: theme["--muted"],
    cursor: "pointer",
  },
  clearSearchIcon: {
    width: "14px",
  },
  sidebarFilters: {
    display: "flex",
    gap: "4px",
    marginTop: "12px",
    margin: {
      default: null,
      "@media (max-width: 720px)": "0",
    },
  },
  filterButton: {
    display: "flex",
    alignItems: "center",
    gap: "7px",
    minHeight: "32px",
    padding: "4px 10px",
    borderWidth: "0",
    borderStyle: "solid",
    borderRadius: "7px",
    backgroundColor: {
      default: "transparent",
      ':is([aria-pressed="true"])': theme["--surface-strong"],
    },
    color: {
      default: theme["--muted"],
      ':is([aria-pressed="true"])': theme["--ink"],
    },
    fontSize: "11px",
    cursor: "pointer",
  },
  filterCount: {
    fontVariantNumeric: "tabular-nums",
    fontSize: "10px",
  },
  sidebarEmpty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: {
      default: "9px",
      "@media (max-width: 720px)": "4px",
    },
    marginTop: "12px",
    padding: {
      default: "18px 12px",
      "@media (max-width: 720px)": "10px",
    },
    color: theme["--muted"],
    margin: {
      default: null,
      "@media (max-width: 720px)": "0",
    },
  },
  sidebarLoadingLines: {
    display: "block",
    width: "100%",
    height: "42px",
    borderRadius: "7px",
    backgroundImage:
      "linear-gradient(var(--surface-strong) 0 12px, transparent 12px 24px, var(--surface-strong) 24px 36px, transparent 36px)",
  },
  emptyTitle: {
    color: theme["--ink"],
    fontSize: "12px",
    fontWeight: "600",
  },
  emptyDescription: {
    margin: "0",
    fontSize: "12px",
    lineHeight: "1.6",
  },
  emptyErrorTitle: {
    color: theme["--danger"],
  },
  emptyIcon: {
    width: "22px",
    height: "22px",
    marginBottom: "6px",
    display: {
      default: null,
      "@media (max-width: 720px)": "none",
    },
  },
  emptyAction: {
    minHeight: "36px",
    padding: "0",
    borderWidth: "0",
    borderStyle: "solid",
    backgroundColor: "transparent",
    color: theme["--focus"],
    textAlign: "left",
    fontSize: "12px",
    cursor: "pointer",
  },
  sidebarSessionList: {
    display: "flex",
    minWidth: "0",
    flexDirection: {
      default: "column",
      "@media (max-width: 720px)": "column",
    },
    gap: {
      default: "2px",
      "@media (max-width: 720px)": "6px",
    },
    margin: {
      default: "0",
      "@media (max-width: 720px)": "0",
    },
    padding: "2px",
    listStyle: "none",
    minHeight: "0",
    overflowY: "auto",
  },
  sessionButton: {
    display: "flex",
    width: {
      default: "100%",
      "@media (max-width: 720px)": "100%",
      "@media (max-width: 480px)": "100%",
    },
    minWidth: "0",
    minHeight: {
      default: "54px",
      "@media (max-width: 720px)": "58px",
      "@media (max-width: 480px)": "58px",
    },
    flexDirection: "column",
    justifyContent: "center",
    gap: "5px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: {
      default: "transparent",
      ':is([aria-current="page"])': "color-mix(in srgb, var(--focus) 24%, var(--rule))",
    },
    borderRadius: "10px",
    backgroundColor: {
      default: "transparent",
      ":hover": "color-mix(in srgb, var(--surface) 58%, transparent)",
      ':is([aria-current="page"])': theme["--focus-soft"],
      "@media (max-width: 720px)": "color-mix(in srgb, var(--surface) 38%, transparent)",
    },
    cursor: "pointer",
    padding: "8px",
    textAlign: "left",
    transition: "background-color 120ms ease-out, border-color 120ms ease-out",
    color: {
      default: null,
      ':is([aria-current="page"])': theme["--ink-strong"],
    },
  },
  sessionButtonHeading: {
    display: "flex",
    alignItems: "baseline",
    gap: "10px",
    width: "100%",
  },
  sessionButtonName: {
    width: "100%",
    minWidth: "0",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: "12px",
    fontWeight: "550",
    flex: "1",
    color: theme["--ink"],
  },
  sessionButtonState: {
    flexShrink: "0",
    fontSize: "10px",
    color: theme["--muted"],
  },
  workingState: {
    color: theme["--success"],
  },
  recoveringState: {
    color: theme["--warning"],
  },
  sessionButtonContext: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
    maxWidth: "100%",
    color: theme["--muted"],
    fontSize: "10px",
  },
  contextIcon: {
    width: "12px",
    height: "12px",
    flexShrink: "0",
  },
  contextLabel: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  workspaceFooter: {
    display: {
      default: "flex",
      "@media (max-width: 720px)": "none",
    },
    alignItems: "center",
    gap: "9px",
    padding: "14px 16px",
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: theme["--rule"],
  },
  workspaceIcon: {
    flex: "0 0 16px",
    width: "16px",
    color: theme["--muted"],
  },
  workspaceDetails: {
    display: "grid",
    minWidth: "0",
    gap: "3px",
  },
  workspaceName: {
    fontSize: "11px",
    fontWeight: "550",
  },
  workspacePath: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: theme["--muted"],
    fontSize: "10px",
  },
})
