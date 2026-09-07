import { useMemo, useState } from "react"
import { UpdateNoticeWithClient, type UpdateClient } from "../renderer/components/update-notice"
import type { UpdateState } from "../packages/updates"

/** Isolated update scenario never invokes RPC, installs dependencies, or restarts an app. */
export default function UpdateScenario() {
  const [failure, setFailure] = useState(false)
  const [slow, setSlow] = useState(false)
  const [statusReads, setStatusReads] = useState(0)
  const [applications, setApplications] = useState(0)
  const client = useMemo<UpdateClient & { announce: () => void }>(() => {
    const delay = () => new Promise<void>((resolve) => setTimeout(resolve, slow ? 1200 : 0))
    const listeners = new Set<(state: unknown) => void>()
    let state: UpdateState = { phase: "idle" }
    return {
      announce: () => { state = { phase: "available", version: "0.1.1", revision: "fixture" }; for (const listener of listeners) listener(state) },
      subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
      status: async () => { setStatusReads((count) => count + 1); return state },
      check: async () => { await delay(); state = failure ? { phase: "error", message: "Download unavailable. Try again." } : { phase: "available", version: "0.1.1", revision: "fixture" }; return state },
      apply: async () => { await delay(); setApplications((count) => count + 1); state = { phase: "restarting" }; return state },
    }
  }, [failure, slow])
  return <main>
    <h1>Update scenario</h1>
    <label><input type="checkbox" checked={failure} onChange={(event) => setFailure(event.target.checked)} />Reject checks</label>
    <label><input type="checkbox" checked={slow} onChange={(event) => setSlow(event.target.checked)} />Slow responses</label>
    <button type="button" onClick={client.announce}>Background update</button>
    <p>Status reads: {statusReads}</p>
    <p>Apply requests: {applications}</p>
    <UpdateNoticeWithClient client={client} />
  </main>
}
