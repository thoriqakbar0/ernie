import * as stylex from "@stylexjs/stylex"
import { theme } from "../theme.stylex"

/** Styles owned by this surface, including its responsive and interaction states. */
export const styles = stylex.create({
  agentSidebarTools: {
    alignItems: {
      "@media (max-width: 720px)": "center",
      default: null,
    },
    backgroundColor: theme["--surface-muted"],
    display: {
      "@media (max-width: 720px)": "flex",
      default: null,
    },
    flexShrink: "0",
    gap: {
      "@media (max-width: 720px)": "8px",
      default: null,
    },
    padding: "0 2px 10px",
    paddingBottom: {
      "@media (max-width: 720px)": "6px",
      default: null,
    },
  },
  clearSearchButton: {
    backgroundColor: "transparent",
    borderStyle: "solid",
    borderWidth: "0",
    color: theme["--muted"],
    cursor: "pointer",
    display: "grid",
    flex: "0 0 28px",
    height: "32px",
    placeItems: "center",
  },
  clearSearchIcon: {
    width: "14px",
  },
  closeIcon: {
    width: "16px",
  },
  contextIcon: {
    flexShrink: "0",
    height: "12px",
    width: "12px",
  },
  contextLabel: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  creationMessage: {
    backgroundColor: {
      ':is([role="alert"])': theme["--danger-soft"],
      default: theme["--surface"],
    },
    borderRadius: "8px",
    color: {
      ':is([role="alert"])': theme["--danger"],
      default: theme["--muted"],
    },
    fontSize: "11px",
    lineHeight: "1.45",
    margin: "0 8px 10px",
    padding: "8px 9px",
  },
  emptyAction: {
    backgroundColor: "transparent",
    borderStyle: "solid",
    borderWidth: "0",
    color: theme["--focus"],
    cursor: "pointer",
    fontSize: "12px",
    minHeight: "36px",
    padding: "0",
    textAlign: "left",
  },
  emptyDescription: {
    fontSize: "12px",
    lineHeight: "1.6",
    margin: "0",
  },
  emptyErrorTitle: {
    color: theme["--danger"],
  },
  emptyIcon: {
    display: {
      "@media (max-width: 720px)": "none",
      default: null,
    },
    height: "22px",
    marginBottom: "6px",
    width: "22px",
  },
  emptyTitle: {
    color: theme["--ink"],
    fontSize: "12px",
    fontWeight: "600",
  },
  filterButton: {
    alignItems: "center",
    backgroundColor: {
      ':is([aria-pressed="true"])': theme["--surface-strong"],
      default: "transparent",
    },
    borderRadius: "7px",
    borderStyle: "solid",
    borderWidth: "0",
    color: {
      ':is([aria-pressed="true"])': theme["--ink"],
      default: theme["--muted"],
    },
    cursor: "pointer",
    display: "flex",
    fontSize: "11px",
    gap: "7px",
    minHeight: "32px",
    padding: "4px 10px",
  },
  filterCount: {
    fontSize: "10px",
    fontVariantNumeric: "tabular-nums",
  },
  newSessionButton: {
    WebkitAppRegion: "no-drag",
    backgroundColor: {
      ":hover:not(:disabled)": theme["--accent-hover"],
      default: theme["--accent"],
    },
    borderRadius: "9px",
    borderStyle: "solid",
    borderWidth: "0",
    boxShadow: {
      ":hover:not(:disabled)": "0 2px 7px color-mix(in srgb, var(--accent) 35%, transparent)",
      default: null,
    },
    color: theme["--on-accent"],
    cursor: "pointer",
    display: "grid",
    flex: "0 0 auto",
    height: {
      "@media (max-width: 480px)": "34px",
      "@media (max-width: 720px)": "34px",
      default: "34px",
    },
    opacity: {
      ":disabled": "0.55",
      default: null,
    },
    placeItems: "center",
    scale: {
      ":active:not(:disabled)": "0.96",
      default: null,
    },
    transitionDuration: "120ms",
    transitionProperty: "background-color, box-shadow, scale",
    transitionTimingFunction: "ease-out",
    width: {
      "@media (max-width: 480px)": "34px",
      "@media (max-width: 720px)": "34px",
      default: "34px",
    },
  },
  recoveringState: {
    color: theme["--warning"],
  },
  searchIcon: {
    color: theme["--muted"],
    flex: "0 0 14px",
    width: "14px",
  },
  searchInput: {
    "::-webkit-search-cancel-button": {
      display: "none",
    },
    backgroundColor: "transparent",
    borderStyle: "solid",
    borderWidth: "0",
    color: theme["--ink"],
    fontSize: "12px",
    minWidth: "0",
    outlineStyle: "none",
    width: "100%",
  },
  sessionButton: {
    backgroundColor: {
      ":hover": "color-mix(in srgb, var(--surface) 58%, transparent)",
      ':is([aria-current="page"])': theme["--focus-soft"],
      "@media (max-width: 720px)": "color-mix(in srgb, var(--surface) 38%, transparent)",
      default: "transparent",
    },
    borderColor: {
      ':is([aria-current="page"])': "color-mix(in srgb, var(--focus) 24%, var(--rule))",
      default: "transparent",
    },
    borderRadius: "10px",
    borderStyle: "solid",
    borderWidth: "1px",
    color: {
      ':is([aria-current="page"])': theme["--ink-strong"],
      default: null,
    },
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    gap: "5px",
    justifyContent: "center",
    minHeight: {
      "@media (max-width: 480px)": "58px",
      "@media (max-width: 720px)": "58px",
      default: "54px",
    },
    minWidth: "0",
    padding: "8px",
    textAlign: "left",
    transition: "background-color 120ms ease-out, border-color 120ms ease-out",
    width: {
      "@media (max-width: 480px)": "100%",
      "@media (max-width: 720px)": "100%",
      default: "100%",
    },
  },
  sessionButtonContext: {
    alignItems: "center",
    color: theme["--muted"],
    display: "flex",
    fontSize: "10px",
    gap: "5px",
    maxWidth: "100%",
  },
  sessionButtonHeading: {
    alignItems: "baseline",
    display: "flex",
    gap: "10px",
    width: "100%",
  },
  sessionButtonName: {
    color: theme["--ink"],
    flex: "1",
    fontSize: "12px",
    fontWeight: "550",
    minWidth: "0",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    width: "100%",
  },
  sessionButtonState: {
    color: theme["--muted"],
    flexShrink: "0",
    fontSize: "10px",
  },
  sessionCreationFeedback: {
    display: {
      ":empty": "none",
      default: null,
    },
  },
  sessionSidebar: {
    backgroundColor: theme["--surface-muted"],
    color: theme["--ink"],
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minWidth: "0",
  },
  sidebarBrand: {
    WebkitAppRegion: "drag",
    alignItems: "center",
    borderWidth: 0,
    display: "flex",
    gap: "12px",
    justifyContent: "space-between",
    minHeight: {
      "@media (max-width: 720px)": "44px",
      default: "68px",
    },
    padding: {
      "@media (max-width: 720px)": "6px 12px",
      default: "14px 14px 12px 16px",
    },
  },
  sidebarBrandActions: {
    WebkitAppRegion: "no-drag",
    alignItems: "center",
    backgroundColor: theme["--surface"],
    borderRadius: "12px",
    boxShadow: "0 0 0 1px oklch(1 0 0 / 0.08),\n    0 2px 5px rgb(43 26 7 / 0.12)",
    display: "flex",
    gap: "2px",
    padding: "3px",
  },
  sidebarBrandIdentity: {
    alignItems: "center",
    display: "flex",
    gap: {
      "@media (max-width: 480px)": "6px",
      default: "10px",
    },
    minWidth: "0",
  },
  sidebarBrandMark: {
    color: theme["--ink"],
    flex: "0 0 auto",
    height: {
      "@media (max-width: 480px)": "24px",
      "@media (max-width: 720px)": "28px",
      default: "34px",
    },
    width: {
      "@media (max-width: 480px)": "24px",
      "@media (max-width: 720px)": "28px",
      default: "34px",
    },
  },
  sidebarBrandName: {
    display: {
      "@media (max-width: 720px)": "block",
      default: null,
    },
    fontSize: {
      "@media (max-width: 480px)": "13px",
      default: "15px",
    },
    fontWeight: "760",
    letterSpacing: "-0.02em",
    margin: "0",
  },
  sidebarCloseButton: {
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
    height: "34px",
    placeItems: "center",
    scale: {
      ":active": "0.96",
      default: null,
    },
    transitionDuration: "120ms",
    transitionProperty: "background-color, color, scale",
    transitionTimingFunction: "ease-out",
    width: "34px",
  },
  sidebarEmpty: {
    alignItems: "flex-start",
    color: theme["--muted"],
    display: "flex",
    flexDirection: "column",
    gap: {
      "@media (max-width: 720px)": "4px",
      default: "9px",
    },
    margin: {
      "@media (max-width: 720px)": "0",
      default: null,
    },
    marginTop: "12px",
    padding: {
      "@media (max-width: 720px)": "10px",
      default: "18px 12px",
    },
  },
  sidebarFilters: {
    display: "flex",
    gap: "4px",
    margin: {
      "@media (max-width: 720px)": "0",
      default: null,
    },
    marginTop: "12px",
  },
  sidebarLoadingLines: {
    backgroundImage:
      "linear-gradient(var(--surface-strong) 0 12px, transparent 12px 24px, var(--surface-strong) 24px 36px, transparent 36px)",
    borderRadius: "7px",
    display: "block",
    height: "42px",
    width: "100%",
  },
  sidebarNav: {
    alignItems: {
      "@media (max-width: 720px)": "stretch",
      default: null,
    },
    display: {
      "@media (max-width: 720px)": "flex",
      default: "flex",
    },
    flex: "1",
    flexDirection: "column",
    minHeight: "0",
    minWidth: {
      "@media (max-width: 720px)": "0",
      default: null,
    },
    overflow: {
      "@media (max-width: 720px)": "hidden",
      default: "hidden",
    },
    overflowX: {
      "@media (max-width: 720px)": "auto",
      default: null,
    },
    overflowY: {
      "@media (max-width: 720px)": "hidden",
      default: "hidden",
    },
    padding: {
      "@media (max-width: 720px)": "0 10px 8px",
      default: "0 10px 12px",
    },
  },
  sidebarSearch: {
    alignItems: "center",
    backgroundColor: theme["--surface"],
    borderColor: {
      ":focus-within": theme["--focus"],
      default: theme["--rule"],
    },
    borderRadius: "9px",
    borderStyle: "solid",
    borderWidth: "1px",
    boxShadow: {
      ":focus-within": "0 0 0 2px var(--focus-soft)",
      default: null,
    },
    display: "flex",
    flex: {
      "@media (max-width: 720px)": "1",
      default: null,
    },
    gap: "8px",
    minHeight: "38px",
    minWidth: {
      "@media (max-width: 720px)": "0",
      default: null,
    },
    padding: "0 9px",
  },
  sidebarSessionList: {
    display: "flex",
    flexDirection: {
      "@media (max-width: 720px)": "column",
      default: "column",
    },
    gap: {
      "@media (max-width: 720px)": "6px",
      default: "2px",
    },
    listStyle: "none",
    margin: {
      "@media (max-width: 720px)": "0",
      default: "0",
    },
    minHeight: "0",
    minWidth: "0",
    overflowY: "auto",
    padding: "2px",
  },
  workingState: {
    color: theme["--success"],
  },
  workspaceDetails: {
    display: "grid",
    gap: "3px",
    minWidth: "0",
  },
  workspaceFooter: {
    alignItems: "center",
    borderTopColor: theme["--rule"],
    borderTopStyle: "solid",
    borderTopWidth: "1px",
    display: {
      "@media (max-width: 720px)": "none",
      default: "flex",
    },
    gap: "9px",
    padding: "14px 16px",
  },
  workspaceIcon: {
    color: theme["--muted"],
    flex: "0 0 16px",
    width: "16px",
  },
  workspaceName: {
    fontSize: "11px",
    fontWeight: "550",
  },
  workspacePath: {
    color: theme["--muted"],
    fontSize: "10px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
})
