import * as stylex from "@stylexjs/stylex"
import erniePackage from "../../../package.json"
import primePackage from "../../../node_modules/prime-agent/package.json"
import { usePrimeSessionState } from "../prime-agent-state"
import { theme } from "../theme.stylex"

/** Package versions are build metadata; catalog health does not imply a running session. */
export function RuntimeStatus() {
  const state = usePrimeSessionState()
  const status = state.isPending ? "loading" : state.isError ? "unavailable" : "ready"
  return <footer {...stylex.props(styles.footer)} title="Prime Agent package version and session catalog status. External daemon versions may differ.">
    <span>Prime Agent pkg {primePackage.version} · <span {...stylex.props(status === "ready" && styles.ready)}>{status}</span></span><span>Ernie {erniePackage.version}</span>
  </footer>
}
const styles = stylex.create({
  ready: { color: theme["--success"] },
  footer: { display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: "4px 10px", flexShrink: 0, padding: "6px 12px", fontSize: 10, lineHeight: 1.5, color: theme["--muted"], fontVariantNumeric: "tabular-nums" },
})
