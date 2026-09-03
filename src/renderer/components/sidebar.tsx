import * as stylex from "@stylexjs/stylex"
import { styles } from "./sidebar.stylex"
import { useState } from "react"
import {
  useCreatePrimeSession,
  usePrimeSessionSelection,
  usePrimeSessions,
} from "../prime-agent-state"

export function Sidebar() {
  const sessions = usePrimeSessions()
  const createSession = useCreatePrimeSession()
  const { selectedSessionId, selectSession } = usePrimeSessionSelection()
  const [conversationsExpanded, setConversationsExpanded] = useState(true)

  return (
    <aside
      aria-label="Sidebar"
      {...stylex.props(styles.flex, styles.hScreen, styles.wFull, styles.flexCol, styles.borderR, styles.borderZinc20080, styles.bgZinc50, styles.textZinc950, styles.darkBorderZinc800, styles.darkBgZinc950, styles.darkTextZinc50)}
    >
      <div {...stylex.props(styles.flex, styles.h52px, styles.shrink0, styles.itemsCenter, styles.justifyBetween, styles.px3)}>
        <div {...stylex.props(styles.flex, styles.minW0, styles.itemsCenter, styles.gap2)}>
          <ErnieMark />
          <span {...stylex.props(styles.truncate, styles.textSm, styles.fontMedium, styles.trackingTight)}>Ernie</span>
        </div>
        <button
          aria-label="New conversation"
          {...stylex.props(styles.grid, styles.size7, styles.placeItemsCenter, styles.roundedMd, styles.textZinc500, styles.transition, styles.hoverBgZinc20080, styles.hoverTextZinc950, styles.focusVisibleOutline2, styles.focusVisibleOutlineOffset2, styles.focusVisibleOutlineZinc500, styles.darkHoverBgZinc800, styles.darkHoverTextWhite)}
          disabled={createSession.isPending}
          onClick={() => createSession.mutate()}
          type="button"
        >
          <PlusIcon />
        </button>
      </div>

      <nav aria-label="Conversations" {...stylex.props(styles.minH0, styles.flex1, styles.overflowYAuto, styles.px2, styles.py2)}>
        <button
          aria-controls="today-conversations"
          aria-expanded={conversationsExpanded}
          {...stylex.props(styles.flex, styles.h8, styles.wFull, styles.itemsCenter, styles.justifyBetween, styles.roundedMd, styles.px2, styles.textXs, styles.fontMedium, styles.textZinc500, styles.hoverTextZinc700, styles.focusVisibleOutline2, styles.focusVisibleOutlineOffset1, styles.focusVisibleOutlineZinc500, styles.darkHoverTextZinc300)}
          onClick={() => setConversationsExpanded((expanded) => !expanded)}
          type="button"
        >
          <span>Conversations</span>
          <ChevronIcon expanded={conversationsExpanded} />
        </button>
        {conversationsExpanded ? (
          <ul {...stylex.props(styles.spaceY05, styles.px05)} id="today-conversations">
            {sessions.data?.length === 0 ? (
              <li {...stylex.props(styles.flex, styles.h8, styles.itemsCenter, styles.px2, styles.textXs, styles.textZinc400, styles.darkTextZinc600)}>
                No conversations yet
              </li>
            ) : sessions.data?.map((session) => (
              <li key={session.id}>
                <button
                  aria-current={session.id === selectedSessionId ? "page" : undefined}
                  {...stylex.props(
                    styles.flex,
                    styles.h8,
                    styles.wFull,
                    styles.minW0,
                    styles.itemsCenter,
                    styles.gap2,
                    styles.roundedMd,
                    styles.px2,
                    styles.textLeft,
                    styles.textSm,
                    styles.transition,
                    styles.focusVisibleOutline2,
                    styles.focusVisibleOutlineOffset1,
                    styles.focusVisibleOutlineZinc500,
                    session.id === selectedSessionId ? styles.bgZinc20075 : styles.textZinc600,
                    session.id === selectedSessionId && styles.fontMedium,
                    session.id === selectedSessionId && styles.textZinc950,
                    session.id === selectedSessionId ? styles.darkBgZinc800 : styles.darkTextZinc400,
                    session.id === selectedSessionId && styles.darkTextZinc50,
                    session.id !== selectedSessionId && styles.hoverBgZinc20055,
                    session.id !== selectedSessionId && styles.hoverTextZinc950,
                    session.id !== selectedSessionId && styles.darkHoverBgZinc900,
                    session.id !== selectedSessionId && styles.darkHoverTextZinc100,
                  )}
                  onClick={() => selectSession(session.id)}
                  type="button"
                >
                  <SessionStateDot state={session.state} />
                  <span {...stylex.props(styles.minW0, styles.flex1, styles.truncate)}>{session.name ?? session.cwd}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </nav>

      <div {...stylex.props(styles.borderT, styles.borderZinc20080, styles.p2, styles.darkBorderZinc800)}>
        <button
          {...stylex.props(styles.flex, styles.wFull, styles.itemsCenter, styles.gap2, styles.roundedLg, styles.px25, styles.py2, styles.textSm, styles.textZinc600, styles.transition, styles.hoverBgZinc20070, styles.hoverTextZinc950, styles.focusVisibleOutline2, styles.focusVisibleOutlineOffset1, styles.focusVisibleOutlineZinc500, styles.darkTextZinc400, styles.darkHoverBgZinc900, styles.darkHoverTextZinc100)}
          type="button"
        >
          <SettingsIcon />
          Settings
        </button>
      </div>
    </aside>
  )
}

function ErnieMark() {
  return (
    <svg aria-label="Ernie" {...stylex.props(styles.h35, styles.w4, styles.shrink0)} fill="none" viewBox="0 0 16 14">
      <path d="M2 2h11M2 7h8M2 12h11" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  )
}

function SessionStateDot({ state }: Readonly<{ state: "idle" | "working" | "recovering" }>) {
  return <span aria-hidden="true" {...stylex.props(
    styles.size15,
    styles.shrink0,
    styles.roundedFull,
    state === "working" ? styles.bgEmerald500 : state === "recovering" ? styles.bgAmber500 : styles.bgZinc300,
    state === "idle" && styles.darkBgZinc700,
  )} />
}

function ChevronIcon({ expanded }: Readonly<{ expanded: boolean }>) {
  return (
    <svg
      aria-hidden="true"
      {...stylex.props(styles.size3, styles.transitionTransform, expanded && styles.rotate90)}
      fill="none"
      viewBox="0 0 12 12"
    >
      <path d="m4.5 2.5 3.5 3.5-3.5 3.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.25" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" {...stylex.props(styles.size4)} fill="none" viewBox="0 0 16 16">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg aria-hidden="true" {...stylex.props(styles.size4)} fill="none" viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="2.25" stroke="currentColor" strokeWidth="1.25" />
      <path d="M8 1.75v1.1M8 13.15v1.1M1.75 8h1.1M13.15 8h1.1M3.58 3.58l.78.78M11.64 11.64l.78.78M12.42 3.58l-.78.78M4.36 11.64l-.78.78" stroke="currentColor" strokeLinecap="round" strokeWidth="1.25" />
    </svg>
  )
}
