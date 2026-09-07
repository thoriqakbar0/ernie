import * as stylex from "@stylexjs/stylex"
import type { PrimeDaemonConnection } from "../../packages/prime-agent"
import { describePrimeDaemonConnection } from "../prime-daemon-status"
import { styles } from "./agent-roster.styles"
import { GeneratedCharacter } from "./generated-avatar"

/** Keeps a confirmed empty catalog distinct from loading or unavailable daemon data. */
export const SidebarEmptyState = ({
  search,
  showRecovery = true,
  pending,
  error,
  connection,
  clearSearch,
  retry,
}: Readonly<{
  search: string
  showRecovery?: boolean
  pending: boolean
  error: boolean
  connection?: PrimeDaemonConnection
  clearSearch: () => void
  retry: () => Promise<void>
}>) => {
  if (search) {
    return (
      <div {...stylex.props(styles.empty)}>
        <h2 {...stylex.props(styles.emptyTitle)}>No Agents match “{search}”</h2>
        <button type="button" {...stylex.props(styles.emptyAction)} onClick={clearSearch}>
          Clear search
        </button>
      </div>
    )
  }
  const offline = connection && connection.state.status !== "connected"
  if (!pending && !error && !offline) {
    return (
      <div {...stylex.props(styles.ghostRow)}>
        <span {...stylex.props(styles.hidden)}>No active conversations yet.</span>
        <div aria-hidden="true" {...stylex.props(styles.ghostAgent)}>
          <GeneratedCharacter seed={42} animated={false} />
        </div>
        <div {...stylex.props(styles.ghostCopy)}>
          <p {...stylex.props(styles.ghostTitle)}>a little quiet here.</p>
          <p>let’s make something together.</p>
        </div>
      </div>
    )
  }
  if (!showRecovery) {
    return null
  }
  let title = "Loading conversations…"
  let message = "Waiting for Prime Agent connection status."
  let busy = pending
  if (connection) {
    const description = describePrimeDaemonConnection(connection.state)
    ;({ label: title, message, busy } = description)
  } else if (error) {
    title = "Connection status unavailable"
    message = "Ernie could not read the daemon connection status. Retry the connection."
  }
  return (
    <div {...stylex.props(styles.empty)}>
      <h2 {...stylex.props(styles.emptyTitle)}>
        <output>{title}</output>
      </h2>
      <details {...stylex.props(styles.emptyDescription)}>
        <summary>Connection details</summary>
        {message}
      </details>
      {connection?.state.status === "not-installed" ? (
        <a
          href="https://github.com/PrimeIntellect-ai/prime-agent#installation"
          target="_blank"
          rel="noreferrer"
        >
          Installation instructions
        </a>
      ) : null}
      {busy ? null : (
        <button type="button" {...stylex.props(styles.emptyAction)} onClick={retry}>
          Retry connection
        </button>
      )}
    </div>
  )
}
