import { styles as sharedStyles } from "../component-styles"
import { styles } from "./session-notice.styles"
import * as stylex from "@stylexjs/stylex"
import type { ReactNode } from "react"
type SessionNoticeProps = Readonly<{
  children: ReactNode
  tone: "danger" | "warning"
}>

/** Announces danger immediately and warning politely while keeping the message visible. */
export function SessionNotice({ children, tone }: SessionNoticeProps) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      {...stylex.props(
        styles.sessionNotice,
        tone === "warning" && styles.sessionNoticeWarning,
        tone === "danger" && styles.sessionNoticeDanger,
      )}
    >
      <NoticeIcon xstyle={[sharedStyles.controlIcon, styles.noticeIcon]} />
      <p {...stylex.props(styles.noticeText)}>{children}</p>
    </div>
  )
}
function NoticeIcon({ xstyle }: { xstyle?: stylex.StyleXStyles }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      viewBox="0 0 16 16"
      {...stylex.props(sharedStyles.controlIcon, xstyle)}
    >
      <circle cx="8" cy="8" r="5.75" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 4.7v3.8M8 11.2v.1"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
    </svg>
  )
}
