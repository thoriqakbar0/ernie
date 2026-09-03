import type { ReactNode } from "react"

type SessionNoticeProps = Readonly<{
  children: ReactNode
  tone: "danger" | "warning"
}>

/** Announces danger immediately and warning politely while keeping the message visible. */
export function SessionNotice({ children, tone }: SessionNoticeProps) {
  return (
    <div className={`session-notice session-notice--${tone}`} role={tone === "danger" ? "alert" : "status"}>
      <NoticeIcon />
      <p>{children}</p>
    </div>
  )
}

function NoticeIcon() {
  return (
    <svg aria-hidden="true" className="control-icon" fill="none" viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="5.75" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 4.7v3.8M8 11.2v.1" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
    </svg>
  )
}
