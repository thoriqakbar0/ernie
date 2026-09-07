import * as stylex from "@stylexjs/stylex"
import { styles } from "./update-notice.styles"
import { useEffect, useState } from "react"
import { useRpc } from "@zenbujs/core/react"
import { Schema } from "effect"
import { UpdateState } from "../../packages/updates"

/** Update transport shared by the production RPC adapter and isolated browser scenarios. */
export type UpdateClient = Readonly<{ status: () => Promise<unknown>; check: () => Promise<unknown>; apply: () => Promise<unknown> }>

/** Connects the update controls to the main process. */
export function UpdateNotice() {
  const rpc = useRpc()
  return <UpdateNoticeWithClient client={rpc.app.updates} />
}

/** Shows update state; only the main process can confirm and perform a restart. */
export function UpdateNoticeWithClient({ client }: { client: UpdateClient }) {
  const [state, setState] = useState<UpdateState>({ phase: "disabled" })
  useEffect(() => {
    let active = true
    let polling = false
    const poll = async () => {
      if (polling) return
      polling = true
      try { const next = Schema.decodeUnknownSync(UpdateState)(await client.status()); if (active) setState(next) } catch { /* RPC recovery is retried on the next poll. */ } finally { polling = false }
    }
    void poll()
    const timer = setInterval(() => { void poll() }, 2000)
    return () => { active = false; clearInterval(timer) }
  }, [client])
  const command = async (action: "check" | "apply") => {
    try { setState(Schema.decodeUnknownSync(UpdateState)(await client[action]())) }
    catch { setState({ phase: "error", message: "Ernie could not contact the update service. Try again." }) }
  }
  if (state.phase === "disabled") return null
  return <aside aria-label="Ernie updates" {...stylex.props(styles.notice)}>
    <span role="status">{state.phase === "available" ? `Ernie ${state.version} is available.` : state.phase === "error" ? state.message : state.phase === "preparing" ? "Preparing update…" : state.phase === "restarting" ? "Restarting Ernie…" : state.phase === "checking" ? "Checking for updates…" : "Check for Ernie updates."}</span>
    {state.phase === "available" ? <button type="button" onClick={() => { void command("apply") }}>Update…</button> : state.phase === "idle" || state.phase === "error" ? <button type="button" onClick={() => { void command("check") }}>Check for updates</button> : null}
  </aside>
}
