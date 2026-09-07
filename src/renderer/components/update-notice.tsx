import * as stylex from "@stylexjs/stylex"
import { styles } from "./update-notice.styles"
import { useMemo } from "react"
import { useRpc, useEvents } from "@zenbujs/core/react"
import { useUpdateState } from "./use-update-state"
import type { UpdateClient } from "./use-update-state"

export type { UpdateClient } from "./use-update-state"

/** Shows update state; only the main process can confirm and perform a restart. */
export const UpdateNoticeWithClient = ({ client }: { client: UpdateClient }) => {
  const { state, command } = useUpdateState(client)
  if (state.phase === "disabled") {
    return null
  }
  let message = "Check for Ernie updates."
  if (state.phase === "available") {
    message = `Ernie ${state.version} is available.`
  } else if (state.phase === "error") {
    ;({ message } = state)
  } else if (state.phase === "preparing") {
    message = "Preparing update…"
  } else if (state.phase === "restarting") {
    message = "Restarting Ernie…"
  } else if (state.phase === "checking") {
    message = "Checking for updates…"
  }
  return (
    <aside aria-label="Ernie updates" {...stylex.props(styles.notice)}>
      <output>{message}</output>
      {state.phase === "available" ? (
        <button
          type="button"
          onClick={() => {
            void command("apply")
          }}
        >
          Update…
        </button>
      ) : null}
      {state.phase === "idle" || state.phase === "error" ? (
        <button
          type="button"
          onClick={() => {
            void command("check")
          }}
        >
          Check for updates
        </button>
      ) : null}
    </aside>
  )
}

/** Connects the update controls to the main process. */
export const UpdateNotice = () => {
  const rpc = useRpc()
  const events = useEvents()
  const client = useMemo<UpdateClient>(
    () => ({
      apply: () => rpc.app.updates.apply(),
      check: () => rpc.app.updates.check(),
      status: () => rpc.app.updates.status(),
      subscribe: (listener) => events.app.updateStateChanged.subscribe(listener),
    }),
    [rpc, events],
  )
  return <UpdateNoticeWithClient client={client} />
}
