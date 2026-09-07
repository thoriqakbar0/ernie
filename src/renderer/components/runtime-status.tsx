import type { PrimeDaemonConnection, PrimeSessionSnapshot } from "../../packages/prime-agent"
import * as stylex from "@stylexjs/stylex"
import erniePackage from "../../../package.json"
import primePackage from "../../../node_modules/prime-agent/package.json"
import {
  useConnectPrimeDaemon,
  usePrimeSessionState,
  usePrimeSessionSnapshot,
} from "../prime-agent-state"
import { describePrimeDaemonConnection } from "../prime-daemon-status"
import { theme } from "../theme.stylex"
import { RuntimeConnectionStatus } from "./runtime-connection-status"

const styles = stylex.create({
  button: {
    backgroundColor: theme["--surface-strong"],
    borderRadius: 6,
    color: theme["--ink"],
    cursor: "pointer",
    minHeight: 36,
    padding: "5px 10px",
  },
  details: { flexBasis: "100%", maxHeight: "25dvh", overflowWrap: "anywhere", overflowY: "auto" },
  footer: {
    alignItems: "center",
    color: theme["--muted"],
    display: "flex",
    flexShrink: 0,
    flexWrap: "wrap",
    fontSize: 11,
    fontVariantNumeric: "tabular-nums",
    gap: "4px 10px",
    justifyContent: "flex-end",
    lineHeight: 1.5,
    padding: "2px 12px",
  },
  recovery: { fontSize: 12, marginInlineEnd: "auto" },
})

const recoveryPresentation = ({
  connection,
  snapshot,
  catalogError,
  snapshotError,
}: {
  connection?: PrimeDaemonConnection
  snapshot?: PrimeSessionSnapshot
  catalogError: boolean
  snapshotError: boolean
}): {
  label: string
  busy: boolean
  needsRecovery: boolean
  retrySession: boolean
  version?: string
} => {
  if (!connection) {
    return {
      busy: false,
      label: catalogError ? "Connection unavailable" : "Loading…",
      needsRecovery: catalogError,
      retrySession: false,
    }
  }
  if (connection.state.status !== "connected") {
    const description = describePrimeDaemonConnection(connection.state)
    return {
      busy: description.busy,
      label: description.label,
      needsRecovery: true,
      retrySession: false,
    }
  }
  if (catalogError) {
    return {
      busy: false,
      label: "Couldn’t refresh conversations",
      needsRecovery: true,
      retrySession: false,
    }
  }
  if (
    snapshotError ||
    snapshot?.transport.status === "reconnecting" ||
    snapshot?.transport.status === "failed" ||
    snapshot?.session.state === "recovering"
  ) {
    return {
      busy: false,
      label: "Restoring conversation…",
      needsRecovery: true,
      retrySession: true,
    }
  }
  return {
    busy: false,
    label: "Connected",
    needsRecovery: false,
    retrySession: false,
    version: connection.state.version,
  }
}

/** Owns the actionable connection notice; diagnostics remain collapsed until requested. */
export const RuntimeStatus = ({
  sessionId,
  actionError,
}: {
  sessionId?: string
  actionError?: string
}) => {
  const state = usePrimeSessionState()
  const snapshot = usePrimeSessionSnapshot(sessionId)
  const connect = useConnectPrimeDaemon()
  const { connection } = state
  const presentation = recoveryPresentation({
    catalogError: state.isError,
    connection,
    snapshot: snapshot.data,
    snapshotError: snapshot.isError,
  })
  const { needsRecovery } = presentation
  const description = connection ? describePrimeDaemonConnection(connection.state) : undefined
  const retry = async () => {
    await (presentation.retrySession ? snapshot.refetch() : connect())
  }
  return (
    <footer {...stylex.props(styles.footer)}>
      <output {...stylex.props(needsRecovery && styles.recovery)}>
        <RuntimeConnectionStatus
          label={presentation.label}
          version={presentation.version}
          clientVersion={primePackage.version}
        />
        {needsRecovery ? " · Your draft is kept. You can keep writing." : null}
      </output>
      {needsRecovery ? (
        <button
          type="button"
          disabled={presentation.busy || snapshot.isFetching}
          {...stylex.props(styles.button)}
          onClick={retry}
        >
          Retry connection
        </button>
      ) : null}
      {!needsRecovery && actionError ? (
        <p role="alert">The last action couldn’t finish. Try it again.</p>
      ) : null}
      <span>Ernie {erniePackage.version}</span>
      {needsRecovery || actionError ? (
        <details {...stylex.props(styles.details)}>
          <summary>{needsRecovery ? "Connection details" : "Action details"}</summary>
          {connection ? <div>{connection.socketPath}</div> : null}
          {description ? <div>{description.message}</div> : null}
          {snapshot.data?.transport.status === "failed" ? (
            <div>{snapshot.data.transport.error}</div>
          ) : null}
          {snapshot.error instanceof Error ? <div>{snapshot.error.message}</div> : null}
          {actionError ? <div>{actionError}</div> : null}
          {needsRecovery ? (
            <div>For another endpoint, set ERNIE_PRIME_AGENT_SOCKET before launching Ernie.</div>
          ) : null}
        </details>
      ) : null}
    </footer>
  )
}
