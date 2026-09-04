import * as stylex from "@stylexjs/stylex"
import { theme } from "../theme.stylex"

/** Styles owned by this surface, including its responsive and interaction states. */
export const styles = stylex.create({
  workspacePickerTrigger: {
    display: "inline-flex",
    alignItems: "baseline",
    gap: "5px",
    borderWidth: "0",
    borderStyle: "solid",
    borderBottomWidth: "1px",
    borderBottomStyle: "dotted",
    borderBottomColor: {
      default: theme["--muted"],
      ":hover": theme["--ink-strong"],
      ':is([aria-expanded="true"])': theme["--ink-strong"],
    },
    backgroundColor: "transparent",
    color: "inherit",
    cursor: "pointer",
    padding: "0",
    fontFamily: "inherit",
    fontSize: "inherit",
    fontWeight: "inherit",
    fontStyle: "inherit",
    lineHeight: "inherit",
  },
  workspaceDialog: {
    width: "min(680px, calc(100% - 32px))",
    maxWidth: "680px",
    minHeight: "min(560px, calc(100dvh - 32px))",
    maxHeight: "min(720px, calc(100dvh - 32px))",
    gridTemplateRows: "auto auto auto minmax(0, 1fr)",
    gap: "18px",
    padding: "28px",
  },
  workspaceDialogSummary: {
    margin: "-6px 0 0",
    color: theme["--muted"],
    fontSize: "11px",
  },
  workspaceDialogList: {
    minHeight: "0",
    overflowY: "auto",
  },
  workspaceDialogEmpty: {
    margin: "0",
    padding: "10px 8px",
    color: theme["--muted"],
    fontSize: "12px",
  },
  workspaceDialogOption: {
    display: "flex",
    width: "100%",
    minHeight: "52px",
    height: "auto",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: "8px",
    padding: "8px 10px",
    textAlign: "start",
    whiteSpace: "normal",
    backgroundColor: {
      default: null,
      ':is([aria-current="true"])': theme["--focus-soft"],
    },
  },
  optionIcon: {
    width: "16px",
    flex: "0 0 auto",
  },
  optionDetails: {
    display: "grid",
    minWidth: "0",
    flex: "1",
    gap: "3px",
  },
  optionName: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: "13px",
  },
  optionPath: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: theme["--muted"],
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: "10px",
    fontWeight: "500",
  },
})
