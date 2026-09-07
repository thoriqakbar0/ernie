import { Effect } from "effect"
import { useMemo, useState } from "react"
import type { Dispatch, SetStateAction } from "react"
import { UpdateNoticeWithClient } from "../renderer/components/update-notice"
import type { UpdateClient } from "../renderer/components/update-notice"
import type { UpdateState } from "../packages/updates"

const createUpdateClient = (
  failure: boolean,
  slow: boolean,
  setApplications: Dispatch<SetStateAction<number>>,
  setStatusReads: Dispatch<SetStateAction<number>>,
): UpdateClient & { handleAnnounce: () => void } => {
  const delay = () => Effect.runPromise(Effect.sleep(slow ? 1200 : 0))
  const listeners = new Set<(state: unknown) => void>()
  let state: UpdateState = { phase: "idle" }
  return {
    apply: async () => {
      await delay()
      setApplications((count) => count + 1)
      state = { phase: "restarting" }
      return state
    },
    check: async () => {
      await delay()
      state = failure
        ? { message: "Download unavailable. Try again.", phase: "error" }
        : { phase: "available", revision: "fixture", version: "0.1.1" }
      return state
    },
    handleAnnounce: () => {
      state = { phase: "available", revision: "fixture", version: "0.1.1" }
      for (const listener of listeners) {
        listener(state)
      }
    },
    status: () => {
      setStatusReads((count) => count + 1)
      return Promise.resolve(state)
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/** Isolated update scenario never invokes RPC, installs dependencies, or restarts an app. */
const UpdateScenario = () => {
  const [failure, setFailure] = useState(false)
  const [slow, setSlow] = useState(false)
  const [statusReads, setStatusReads] = useState(0)
  const [applications, setApplications] = useState(0)
  const client = useMemo(
    () => createUpdateClient(failure, slow, setApplications, setStatusReads),
    [failure, slow],
  )
  return (
    <main>
      <h1>Update scenario</h1>
      <label>
        <input
          type="checkbox"
          checked={failure}
          onChange={(event) => setFailure(event.target.checked)}
        />
        Reject checks
      </label>
      <label>
        <input type="checkbox" checked={slow} onChange={(event) => setSlow(event.target.checked)} />
        Slow responses
      </label>
      <button type="button" onClick={client.handleAnnounce}>
        Background update
      </button>
      <p>Status reads: {statusReads}</p>
      <p>Apply requests: {applications}</p>
      <UpdateNoticeWithClient client={client} />
    </main>
  )
}

export default UpdateScenario
