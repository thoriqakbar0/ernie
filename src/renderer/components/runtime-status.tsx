import * as stylex from "@stylexjs/stylex"
import erniePackage from "../../../package.json"
import primePackage from "../../../node_modules/prime-agent/package.json"
import { useConnectPrimeDaemon, usePrimeSessionState } from "../prime-agent-state"
import { describePrimeDaemonConnection } from "../prime-daemon-status"
import { theme } from "../theme.stylex"

const styles = stylex.create({
  button: {
    backgroundColor: theme["--surface-strong"],
    borderRadius: 6,
    color: theme["--ink"],
    cursor: "pointer",
    padding: "5px 10px",
  },
  details: { flexBasis: "100%", overflowWrap: "anywhere" },
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
    padding: "6px 12px",
  },
  ready: { color: theme["--success"] },
})

/** Shows authoritative external connection health separately from package metadata. */
export const RuntimeStatus = () => {
  const state = usePrimeSessionState()
  const connect = useConnectPrimeDaemon()
  const { connection } = state
  const status = connection?.state.status ?? (state.isError ? "unavailable" : "loading")
  const connected = connection?.state.status === "connected"
  const description = connection ? describePrimeDaemonConnection(connection.state) : undefined
  const busy = description?.busy
  return (
    <footer {...stylex.props(styles.footer)}>
      <output>
        Prime Agent ·{" "}
        <span {...stylex.props(connected && styles.ready)}>{description?.label ?? status}</span>
        {connection?.state.status === "connecting" ? ` (${connection.state.attempt}/3)` : null}
        {connection?.state.status === "connected" ? ` · daemon ${connection.state.version}` : null}
      </output>
      {connection && !connected ? (
        <button type="button" disabled={busy} {...stylex.props(styles.button)} onClick={connect}>
          Retry connection
        </button>
      ) : null}
      <span title="Installed client package versions">
        client {primePackage.version} · Ernie {erniePackage.version}
      </span>
      {connection && !connected ? (
        <div {...stylex.props(styles.details)}>
          <div>{connection.socketPath}</div>
          <output>{description?.message}</output>
          <div>For another endpoint, set ERNIE_PRIME_AGENT_SOCKET before launching Ernie.</div>
          {state.isError ? (
            <div>Ernie could not complete the connection request. Retry connection.</div>
          ) : null}
        </div>
      ) : null}
    </footer>
  )
}
