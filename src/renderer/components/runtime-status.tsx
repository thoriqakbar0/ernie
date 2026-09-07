import * as stylex from "@stylexjs/stylex"
import erniePackage from "../../../package.json"
import primePackage from "../../../node_modules/prime-agent/package.json"
import { usePrimeSessionState } from "../prime-agent-state"
import { theme } from "../theme.stylex"

const styles = stylex.create({
  footer: {
    color: theme["--muted"],
    display: "flex",
    flexShrink: 0,
    flexWrap: "wrap",
    fontSize: 10,
    fontVariantNumeric: "tabular-nums",
    gap: "4px 10px",
    justifyContent: "flex-end",
    lineHeight: 1.5,
    padding: "6px 12px",
  },
  ready: { color: theme["--success"] },
})

/** Package versions are build metadata; catalog health does not imply a running session. */
export const RuntimeStatus = () => {
  const state = usePrimeSessionState()
  let status = "ready"
  if (state.isPending) {
    status = "loading"
  } else if (state.isError) {
    status = "unavailable"
  }
  return (
    <footer
      {...stylex.props(styles.footer)}
      title="Prime Agent package version and session catalog status. External daemon versions may differ."
    >
      <span>
        Prime Agent pkg {primePackage.version} ·{" "}
        <span {...stylex.props(status === "ready" && styles.ready)}>{status}</span>
      </span>
      <span>Ernie {erniePackage.version}</span>
    </footer>
  )
}
