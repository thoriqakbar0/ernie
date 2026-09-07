import { useMemo, useState } from "react"
import { UpdateNoticeWithClient, type UpdateClient } from "../renderer/components/update-notice"
import type { UpdateState } from "../packages/updates"

/** Isolated update scenario never invokes RPC, installs dependencies, or restarts an app. */
export default function UpdateScenario() {
  const [failure, setFailure] = useState(false)
  const [applications, setApplications] = useState(0)
  const client = useMemo<UpdateClient>(() => {
    let state: UpdateState = { phase: "idle" }
    return {
      status: async () => state,
      check: async () => { state = failure ? { phase: "error", message: "Download unavailable. Try again." } : { phase: "available", version: "0.1.1", revision: "fixture" }; return state },
      apply: async () => { setApplications((count) => count + 1); state = { phase: "restarting" }; return state },
    }
  }, [failure])
  return <main>
    <h1>Update scenario</h1>
    <label><input type="checkbox" checked={failure} onChange={(event) => setFailure(event.target.checked)} />Reject checks</label>
    <p>Apply requests: {applications}</p>
    <UpdateNoticeWithClient client={client} />
  </main>
}
