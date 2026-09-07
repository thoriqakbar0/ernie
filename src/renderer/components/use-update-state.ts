import { useEffect, useRef, useState } from "react"
import { Schema } from "effect"
import { UpdateState } from "../../packages/updates"
/** Update transport shared by the production RPC adapter and isolated browser scenarios. */
export type UpdateClient = Readonly<{
  status: () => Promise<unknown>
  check: () => Promise<unknown>
  apply: () => Promise<unknown>
  subscribe: (listener: (state: unknown) => void) => () => void
}>

/** Owns immediate command feedback and ignores status reads started before a newer action. */
export const useUpdateState = (client: UpdateClient) => {
  const [state, setState] = useState<UpdateState>({ phase: "disabled" })
  const epoch = useRef(0)
  const busy = useRef(false)
  useEffect(() => {
    busy.current = false
    let polling = false
    let eventVersion = 0
    const unsubscribe = client.subscribe((value) => {
      try {
        const next = Schema.decodeUnknownSync(UpdateState)(value)
        eventVersion += 1
        setState(next)
      } catch {
        /* Invalid events do not replace validated state. */
      }
    })
    const poll = async () => {
      if (polling || busy.current) {
        return
      }
      polling = true
      const started = epoch.current
      const version = eventVersion
      try {
        const next = Schema.decodeUnknownSync(UpdateState)(await client.status())
        if (started === epoch.current && version === eventVersion) {
          setState(next)
        }
      } catch {
        if (started === epoch.current && version === eventVersion) {
          setState({
            message: "Update status is unavailable. Check again to retry.",
            phase: "error",
          })
        }
      } finally {
        polling = false
      }
    }
    void poll()
    const refresh = () => {
      void poll()
    }
    window.addEventListener("focus", refresh)
    window.addEventListener("online", refresh)
    return () => {
      epoch.current += 1
      unsubscribe()
      window.removeEventListener("focus", refresh)
      window.removeEventListener("online", refresh)
    }
  }, [client])

  const command = async (action: "check" | "apply") => {
    if (busy.current) {
      return
    }
    busy.current = true
    epoch.current += 1
    const started = epoch.current
    setState({ phase: action === "check" ? "checking" : "preparing" })
    try {
      const next = Schema.decodeUnknownSync(UpdateState)(await client[action]())
      if (started === epoch.current) {
        setState(next)
      }
    } catch {
      if (started === epoch.current) {
        setState({
          message: "Ernie could not contact the update service. Try again.",
          phase: "error",
        })
      }
    } finally {
      if (started === epoch.current) {
        busy.current = false
      }
    }
  }
  return { command, state }
}
