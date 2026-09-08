import { useState } from "react"
import { useRpc } from "@zenbujs/core/react"
import { Button } from "./ui/button"
import * as stylex from "@stylexjs/stylex"
import type { PrimeSessionActions } from "../../packages/prime-agent"

const styles = stylex.create({
  root: { marginBottom: 8, border: "1px solid var(--rule)", borderRadius: 8, color: "var(--ink)", fontSize: 13 },
  heading: { margin: 0, padding: "8px 12px", fontWeight: 500 },
  list: { margin: 0, padding: "0 12px 10px", listStyle: "none", display: "grid", gap: 8, maxHeight: 180, overflowY: "auto" },
  item: { display: "grid", gap: 2, overflowWrap: "anywhere", whiteSpace: "pre-wrap" },
  label: { color: "var(--muted)", fontSize: 12 },
})

/** Displays the native queue without suggesting that messages have already run. */
export const PendingMessages = ({ queue, sessionId }: { queue?: PrimeSessionActions; sessionId?: string }) => {
  const rpc = useRpc()
  const [pending, setPending] = useState<{ index: number; text: string } | null>(null)
  const [error, setError] = useState<string>()
  const steer = async (index: number, text: string) => {
    if (!sessionId || pending) return
    setPending({ index, text })
    setError(undefined)
    try {
      const result = await rpc.app.primeAgent.steerQueuedMessage({ sessionId, index, text })
      if (result.status !== "applied") setError("This message has moved or already started. Check the queue again.")
    } catch {
      setError("Could not move this message. Check the queue before trying again.")
    } finally {
      setPending(null)
    }
  }
  if (!queue) return null
  const count = queue.steering.length + queue.followUps.length
  if (!count) return null
  return (
    <section aria-label="Pending messages" {...stylex.props(styles.root)}>
      <p {...stylex.props(styles.heading)}>{count} {count === 1 ? "message" : "messages"} waiting</p>
      <ol {...stylex.props(styles.list)}>
        {queue.steering.map((text, index) => <li key={`steer:${index}`} {...stylex.props(styles.item)}><span {...stylex.props(styles.label)}>Steering · next pause</span><span>{text}</span></li>)}
        {queue.followUps.map((text, index) => <li key={`queue:${index}`} {...stylex.props(styles.item)}><span {...stylex.props(styles.label)}>Queued · {index + 1}</span><span>{text}</span><Button type="button" size="sm" disabled={Boolean(pending) || !sessionId} onClick={() => { void steer(index, text) }}>{pending?.index === index && pending.text === text ? "Moving…" : "Steer"}</Button></li>)}
      </ol>
      <span role="status">{pending ? "Moving queued message to steering…" : ""}</span>
      {error ? <p role="alert">{error}</p> : null}
    </section>
  )
}
