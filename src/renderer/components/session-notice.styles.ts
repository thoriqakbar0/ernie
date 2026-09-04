import * as stylex from "@stylexjs/stylex"
import { theme } from "../theme.stylex"

/** Styles owned by this surface, including its responsive and interaction states. */
export const styles = stylex.create({
  sessionNotice: {
    display: "flex",
    flex: "0 0 auto",
    alignItems: "flex-start",
    gap: "10px",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: theme["--rule"],
    padding: {
      default: "10px 22px",
      "@media (max-width: 720px)": "9px 16px",
    },
    fontSize: "12px",
    lineHeight: "1.5",
  },
  sessionNoticeWarning: {
    backgroundColor: theme["--warning-soft"],
    color: theme["--warning"],
  },
  sessionNoticeDanger: {
    backgroundColor: theme["--danger-soft"],
    color: theme["--danger"],
  },
  noticeIcon: {
    marginTop: "1px",
  },
  noticeText: {
    margin: "0",
  },
})
