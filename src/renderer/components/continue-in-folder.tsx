import { FolderIcon } from "lucide-react"
import { useState } from "react"
import * as stylex from "@stylexjs/stylex"
import type { Agent } from "../../packages/agents"
import { useAgents } from "../agent-state"
import { useAgentCreation } from "../agent-creation"
import { useAppNavigation } from "../app-navigation"

const styles = stylex.create({
  button: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "var(--muted)",
    cursor: "pointer",
    minHeight: 36,
    paddingInline: 8,
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  error: { color: "var(--danger)", fontSize: 12 },
})

/** Prepares a new Agent draft in another folder without mutating or sending to the old root. */
export const ContinueInFolder = ({
  agent,
  compact = false,
}: {
  agent: Agent
  compact?: boolean
}) => {
  const { client, execute } = useAgents()
  const { beginInFolder } = useAgentCreation()
  const { navigate } = useAppNavigation()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const choose = async () => {
    setPending(true)
    setError(undefined)
    const result = await execute(() => client.chooseWorkspace())
    setPending(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    if (!result.value) return
    const { avatar, instructions, model, name, provider, role, thinkingLevel, rlmMaxDepth } = agent
    beginInFolder({
      avatar,
      instructions,
      model,
      name,
      provider,
      role,
      cwd: result.value,
      ...(thinkingLevel === undefined ? {} : { thinkingLevel }),
      ...(rlmMaxDepth === undefined ? {} : { rlmMaxDepth }),
    })
    navigate("conversation")
  }
  return (
    <>
      <button
        type="button"
        disabled={pending}
        aria-label={compact ? `Choose folder. Current folder: ${agent.cwd}` : undefined}
        title={`${agent.cwd}\nStart a new chat in another folder; keep this chat.`}
        onClick={() => {
          void choose()
        }}
        {...stylex.props(styles.button)}
      >
        {compact ? (
          <><FolderIcon size={16} aria-hidden="true" /><span>{agent.cwd.split("/").filter(Boolean).at(-1) || "/"}</span></>
        ) : pending ? (
          "Choosing…"
        ) : (
          "Choose another folder"
        )}
      </button>
      {error ? (
        <span role="alert" {...stylex.props(styles.error)}>
          {error}
        </span>
      ) : null}
    </>
  )
}
