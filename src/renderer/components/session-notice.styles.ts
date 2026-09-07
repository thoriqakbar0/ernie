import * as stylex from "@stylexjs/stylex"
import { theme } from "../theme.stylex"

/** Styles owned by this surface, including its responsive and interaction states. */
export const styles = stylex.create({
  noticeIcon: {
    marginTop: "1px",
  },
  noticeText: {
    margin: "0",
  },
  sessionNotice: {
    alignItems: "flex-start",
    borderBottomColor: theme["--rule"],
    borderBottomStyle: "solid",
    borderBottomWidth: "1px",
    display: "flex",
    flex: "0 0 auto",
    fontSize: "12px",
    gap: "10px",
    lineHeight: "1.5",
    padding: {
      "@media (max-width: 720px)": "9px 16px",
      default: "10px 22px",
    },
  },
  sessionNoticeDanger: {
    backgroundColor: theme["--danger-soft"],
    color: theme["--danger"],
  },
  sessionNoticeWarning: {
    backgroundColor: theme["--warning-soft"],
    color: theme["--warning"],
  },
})
