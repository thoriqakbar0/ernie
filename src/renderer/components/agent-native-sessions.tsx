import { DisclosureSummary } from "./ui/disclosure-summary"
import { useRef, useState } from "react"
import * as stylex from "@stylexjs/stylex"
import type { Agent } from "../../packages/agents"
import type { PrimeSessionSnapshot } from "../../packages/prime-agent"
import { useNativeInspection } from "../prime-agent-state"
import { ConversationTranscript } from "./conversation-transcript"
import { styles as settingsStyles } from "./agent-settings.styles"
import { styles } from "./agent-roster.styles"
import { styles as nativeStyles } from "./agent-native-sessions.styles"
import { ChevronRightIcon } from "lucide-react"

type Inspection =
  | { kind: "child"; id: string; name: string }
  | { kind: "saved"; id: string; name: string }

const NativeInspection = ({
  parentId,
  inspection,
  onClose,
}: {
  parentId: string
  inspection: Inspection
  onClose: () => void
}) => {
  const query = useNativeInspection(parentId, inspection)
  return (
    <section aria-label={`Inspect ${inspection.name}`} {...stylex.props(nativeStyles.inspection)}>
      <button type="button" {...stylex.props(styles.menuButton)} onClick={onClose}>
        ← Back to Agent
      </button>
      <h2>{inspection.name}</h2>
      <p>
        {query.data?.source === "saved" ? "Saved transcript · read-only" : "Read-only inspection"}
      </p>
      {query.isError ? (
        <p role="alert">
          {query.error.message}{" "}
          <button
            type="button"
            onClick={() => {
              void query.refetch()
            }}
          >
            Retry
          </button>
        </p>
      ) : null}
      {query.isPending ? (
        <p>
          <output>Opening native transcript…</output>
        </p>
      ) : null}
      {query.data ? (
        <div {...stylex.props(settingsStyles.inspection)}>
          <ConversationTranscript
            sessionId={`${inspection.kind}:${query.data.sessionId}`}
            agentName={inspection.name}
            messages={query.data.messages}
            snapshot={query.data.snapshot}
          />
        </div>
      ) : null}
    </section>
  )
}

/** Native children and retained legacy roots have separate identities and inspection targets. */
export const AgentNativeSessions = ({
  agent,
  snapshot,
}: {
  agent: Agent
  snapshot?: PrimeSessionSnapshot
}) => {
  const opener = useRef<HTMLButtonElement | null>(null)
  const [inspection, setInspection] = useState<Inspection>()
  const children = snapshot?.useful.children ?? []
  const connected = snapshot?.transport.status === "connected"
  const currentRoster = connected && snapshot?.useful.childrenAvailable !== false
  return (
    <section
      aria-label="Native sessions"
      {...stylex.props(settingsStyles.controls, nativeStyles.root)}
    >
      {connected && snapshot?.useful.childrenAvailable === false ? (
        <p>
          <output>This runtime does not expose a subagent roster.</output>
        </p>
      ) : null}
      {children.length ? (
        <details>
          <DisclosureSummary xstyle={nativeStyles.summary}>
            Subagents · {children.length}
            {currentRoster ? "" : " · last known state"}
          </DisclosureSummary>
          <div {...stylex.props(nativeStyles.list)}>
            {children.map((child) => (
              <button
                key={child.id}
                type="button"
                disabled={!currentRoster}
                {...stylex.props(nativeStyles.row)}
                onClick={(event) => {
                  opener.current = event.currentTarget
                  setInspection({
                    id: child.id,
                    kind: "child",
                    name: child.sessionName ?? child.label,
                  })
                }}
              >
                <span {...stylex.props(nativeStyles.name)}>{child.sessionName ?? child.label}</span>
                <span {...stylex.props(nativeStyles.status)}>{child.status}</span>
                <ChevronRightIcon size={14} aria-hidden="true" />
                {child.repliedSinceTask === undefined ? null : (
                  <small {...stylex.props(nativeStyles.receipt)}>
                    {child.repliedSinceTask ? "Reply received" : "No reply received yet"}
                  </small>
                )}
              </button>
            ))}
          </div>
        </details>
      ) : null}
      {inspection && agent.root ? (
        <NativeInspection
          parentId={agent.root.sessionId}
          inspection={inspection}
          onClose={() => {
            setInspection(undefined)
            opener.current?.focus()
          }}
        />
      ) : null}
    </section>
  )
}
