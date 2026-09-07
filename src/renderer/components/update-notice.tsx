import * as stylex from "@stylexjs/stylex"
import { styles } from "./update-notice.styles"
import { useMemo } from "react"
import { useRpc, useEvents } from "@zenbujs/core/react"
import { useUpdateState, type UpdateClient } from "./use-update-state"

export type { UpdateClient } from "./use-update-state"

/** Connects the update controls to the main process. */
export function UpdateNotice() {
  const rpc = useRpc()
  const events = useEvents()
  const client = useMemo<UpdateClient>(() => ({
    status: () => rpc.app.updates.status(), check: () => rpc.app.updates.check(), apply: () => rpc.app.updates.apply(),
    subscribe: (listener) => events.app.updateStateChanged.subscribe(listener),
  }), [rpc, events])
  return <UpdateNoticeWithClient client={client} />
}

/** Shows update state; only the main process can confirm and perform a restart. */
export function UpdateNoticeWithClient({ client }: { client: UpdateClient }) {
  const { state, command } = useUpdateState(client)
  if (state.phase === "disabled") return null
  return <aside aria-label="Ernie updates" {...stylex.props(styles.notice)}>
    <span role="status">{state.phase === "available" ? `Ernie ${state.version} is available.` : state.phase === "error" ? state.message : state.phase === "preparing" ? "Preparing update…" : state.phase === "restarting" ? "Restarting Ernie…" : state.phase === "checking" ? "Checking for updates…" : "Check for Ernie updates."}</span>
    {state.phase === "available" ? <button type="button" onClick={() => { void command("apply") }}>Update…</button> : state.phase === "idle" || state.phase === "error" ? <button type="button" onClick={() => { void command("check") }}>Check for updates</button> : null}
  </aside>
}
