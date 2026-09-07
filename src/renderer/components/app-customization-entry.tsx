import { useEffect, useRef, useState } from "react"
import { useRpc } from "@zenbujs/core/react"
import * as stylex from "@stylexjs/stylex"
import { useAgents } from "../agent-state"
import { useAppNavigation } from "../app-navigation"
import { styles } from "./app-settings.styles"

/** Opens the existing managed-source Agent without dispatching an editing request. */
export function AppCustomizationEntry({ availability }: { availability: "checking" | "ready" | "desktop" | "unavailable" }) {
  const rpc = useRpc()
  const { roster, execute } = useAgents()
  const { navigate } = useAppNavigation()
  const [result, setResult] = useState<{ state: "idle" } | { state: "opening" } | { state: "failed"; message: string }>({ state: "idle" })
  const opening = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  const agent = roster.agents.find(item => item.id === roster.selectedAgentId)
  const open = async () => {
    if (opening.current) return
    opening.current = true
    setResult({ state: "opening" })
    const response = await execute(() => rpc.app.appHistory.customize())
    opening.current = false
    if (!mounted.current) return
    if (!response.ok) {
      setResult({ state: "failed", message: response.error })
      return
    }
    navigate("conversation")
  }
  return <details data-ernie-scope="managed-app-source" {...stylex.props(styles.technicalDetails)}>
    <summary {...stylex.props(styles.technicalSummary)}>Customize Ernie with an Agent</summary>
    <p {...stylex.props(styles.description)}>Open a dedicated Agent to change Ernie’s interface. Describe one change and its intended result before sending.</p>
    <p {...stylex.props(styles.description)} data-agent-id={agent?.id} data-session-id={agent?.root?.sessionId}>
      {agent ? <>Selected Agent: {agent.name}. Conversation workspace: <code {...stylex.props(styles.filePath)}>{agent.cwd}</code>.</> : "No Agent is selected."}
      {" "}The customizer uses Ernie’s managed app source; opening it does not send a message.
    </p>
    <p {...stylex.props(styles.description)}>After editing, ask for the changed files, observed result, and checkpoint ID. App history records source changes; local preferences and conversation data are excluded. A saved checkpoint alone does not verify the interface.</p>
    {availability === "desktop" ? <p {...stylex.props(styles.description)}>Source customization requires the installed Ernie app with recovery. Browser development history contains examples.</p> : null}
    {availability === "unavailable" ? <p {...stylex.props(styles.description)}>Recovery could not be confirmed. Inspect App history and resolve capture errors before editing.</p> : null}
    <div {...stylex.props(styles.actions)}>
      <button type="button" disabled={availability === "desktop" || availability === "checking" || result.state === "opening"} onClick={() => { void open() }} {...stylex.props(styles.button)}>
        {result.state === "opening" ? "Opening customizer…" : result.state === "failed" ? "Retry opening customizer" : "Open Ernie customizer"}
      </button>
      <button type="button" onClick={() => navigate("history")} {...stylex.props(styles.button)}>Inspect App history</button>
    </div>
    <p role="status">{availability === "checking" ? "Checking source customization availability…" : result.state === "opening" ? "Opening the managed-source Agent. No message has been sent." : ""}</p>
    {result.state === "failed" ? <p role="alert">{result.message}</p> : null}
  </details>
}
