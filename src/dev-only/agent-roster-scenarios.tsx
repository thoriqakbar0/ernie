import { useLayoutEffect, useMemo, useRef, useState } from "react"
import * as stylex from "@stylexjs/stylex"
import { Effect } from "effect"
import { emptyRoster } from "../packages/agents"
import type { Agent, AgentResult, Roster } from "../packages/agents"
import type {
  PrimeRlmChild,
  PrimeSessionSnapshot,
  PrimeSessionSummary,
} from "../packages/prime-agent"
import { createPrimeUsefulSessionFixture } from "../packages/prime-agent/fixtures"
import { createMockPrimeAgentClient } from "./prime-agent/mock"
import { PrimeAgentStateProvider } from "../renderer/prime-agent-state"
import type { AgentClient } from "../renderer/agent-state"
import { App } from "../renderer/components/app"
import { theme } from "../renderer/theme.stylex"

const styles = stylex.create({
  app: { flexGrow: 1, minHeight: 0 },
  shell: { display: "flex", flexDirection: "column", height: "100%" },
  toolbar: {
    alignItems: "center",
    backgroundColor: theme["--surface-strong"],
    color: theme["--ink"],
    display: "flex",
    flexWrap: "wrap",
    fontSize: 12,
    gap: 14,
    padding: "8px 14px",
  },
})
const presets = [
  "Populated",
  "Empty",
  "Concurrent activity",
  "Reconnect",
  "Failed connection",
  "Long names",
  "New Agent",
  "Draft conversation",
  "Changed workspace",
  "Tool activity",
  "Subagent activity",
  "Long conversation",
] as const
type Preset = (typeof presets)[number]

const createSeed = (preset: Preset): { roster: Roster; snapshots: PrimeSessionSnapshot[] } => {
  if (preset === "Empty") {
    return { roster: emptyRoster, snapshots: [] }
  }
  const agents: Agent[] = ["Robot", "Eyes", "Coffee", "Star"].map((name, index) => ({
    avatar: (["fern", "tide", "ember", "iris"] as const)[index % 4],
    createdAt: index,
    cwd: "/example/workspace",
    id: `agent-${index}`,
    instructionRevision: 1,
    instructions: "Synthetic scenario instructions",
    model: "",
    name:
      preset === "Long names" && index === 0
        ? "Robot who remembers to ask a very specific question before every ambitious project"
        : name,
    pinned: index === 0,
    provider: "",
    revision: 1,
    role:
      [
        "Code and careful questions",
        "Research and observation",
        "Thoughtful writing",
        "Visual design and storytelling",
      ][index] ?? "",
  }))
  const summaries: PrimeSessionSummary[] = Array.from({ length: 6 }, (_, index) => ({
    activityAt: `2026-09-05T10:0${index}:00Z`,
    activitySummary: index === 0 || index === 2 ? "Reading the navigation contract" : undefined,
    cwd: index === 5 ? "/example/earlier-work" : "/example/workspace",
    id: `scenario-${index}`,
    lifecycle: "live",
    name: [
      "Review the navigation",
      "Sketching the next idea",
      "Read the evidence",
      "A quiet draft",
      "Prepare the release notes",
      "Earlier unassigned work",
    ][index],
    state: (() => {
      if (preset === "Concurrent activity" && index < 2) {
        return "working"
      }
      if (preset === "Concurrent activity" && index === 2) {
        return "recovering"
      }
      return "idle"
    })(),
    workerFailed: preset === "Concurrent activity" && index === 3,
  }))
  if (preset === "New Agent") {
    return { roster: { agents, associations: [], selectedAgentId: agents[3].id }, snapshots: [] }
  }
  const draftConversation = preset === "Draft conversation" || preset === "Changed workspace"
  if (draftConversation) {
    summaries[0] = { ...summaries[0], lifecycle: "draft" }
  }
  if (preset === "Changed workspace") {
    agents[0] = { ...agents[0], cwd: "/example/new-default" }
  }
  const snapshots = summaries.map((session): PrimeSessionSnapshot => {
    const messages = (() => {
      if (draftConversation && session.id === summaries[0].id) {
        return []
      }
      if (preset === "Long conversation") {
        return Array.from({ length: 35 }, (_, index) => ({
          content: `Message ${index + 1}. ${"Inspect the login flow and preserve the existing workspace context. ".repeat(8)}`,
          id: `${session.id}-${index}`,
          role: index % 2 ? ("assistant" as const) : ("user" as const),
        }))
      }
      return [
        {
          content:
            "What would you like to work on? This is a synthetic conversation; no live commands are sent.",
          id: `${session.id}-message`,
          role: "assistant" as const,
        },
      ]
    })()
    const base = createPrimeUsefulSessionFixture(session, messages)
    const children: readonly PrimeRlmChild[] = [
      {
        activity: { kind: "waiting" },
        id: "research",
        label: "Research",
        repliedSinceTask: false,
        sessionDir: "/example/research",
        status: "running",
      },
      {
        answerPreview:
          "Verified the three source documents.\nThe runtime owns child identity and lifecycle.",
        id: "sources",
        label: "Check sources",
        parentId: "research",
        recap: "Reviewed the native contracts.",
        repliedSinceTask: true,
        sessionDir: "/example/sources",
        status: "done",
      },
      {
        error: "The synthetic endpoint is unavailable.",
        id: "checks",
        label: "Check recovery",
        parentId: "research",
        repliedSinceTask: false,
        sessionDir: "/example/checks",
        status: "error",
      },
      {
        id: "cancelled",
        label: "Earlier approach",
        sessionDir: "/example/cancelled",
        status: "cancelled",
      },
    ]
    const fixture =
      preset === "Subagent activity" ? { ...base, children, childrenAvailable: true } : base
    const useful =
      preset === "Tool activity"
        ? {
            ...fixture,
            structuredMessages: [
              ...fixture.structuredMessages,
              {
                content: [
                  {
                    text: "Synthetic output: the login form validates the email before submitting.",
                    type: "text",
                  },
                ],
                isError: false,
                role: "toolResult",
                toolCallId: "example-read",
                toolName: "read",
              },
              {
                content: [
                  {
                    text: "Synthetic output: the login check failed because the fixture has no server.",
                    type: "text",
                  },
                ],
                isError: true,
                role: "toolResult",
                toolCallId: "example-check",
                toolName: "bash",
              },
            ],
          }
        : fixture
    return {
      messages,
      session,
      transport: (() => {
        if (preset === "Reconnect") {
          return { status: "reconnecting" as const }
        }
        if (preset === "Failed connection") {
          return { error: "Synthetic disconnected runtime", status: "failed" as const }
        }
        return { status: "connected" as const }
      })(),
      useful,
    }
  })
  return {
    roster: {
      agents,
      associations: summaries.slice(0, 5).map((session, index) => ({
        agentId:
          preset === "Concurrent activity"
            ? agents[0].id
            : agents[Number(session.id.split("-")[1]) % 4].id,
        sessionId: session.id,
        visitedAt: index === 0 ? 10 : index,
      })),
      selectedAgentId: agents[0].id,
    },
    snapshots,
  }
}

const createScenarioPrime = (seed: ReturnType<typeof createSeed>) => {
  let sendOptions = { loseAck: false, rejectSend: false, slowOpen: false, slowSend: false }
  const prime = createMockPrimeAgentClient({
    afterSend: () => {
      if (sendOptions.loseAck) {
        return Promise.reject(new Error("Synthetic lost acknowledgement"))
      }
      return Promise.resolve()
    },
    beforeAttach: async () => {
      if (sendOptions.slowOpen) {
        await Effect.runPromise(Effect.sleep(4000))
      }
    },
    beforePrompt: async () => {
      const options = sendOptions
      if (options.slowSend) {
        await Effect.runPromise(Effect.sleep(4000))
      }
      if (options.rejectSend) {
        throw new Error("Synthetic prompt rejection")
      }
    },
    initialSnapshots: seed.snapshots,
    replyDelayMs: 60_000,
  })
  return {
    prime,
    setSendOptions: (options: typeof sendOptions) => {
      sendOptions = options
    },
  }
}

const Scenario = ({ preset }: { preset: Preset }) => {
  const seed = useMemo(() => createSeed(preset), [preset])
  const [rejectSend, setRejectSend] = useState(false)
  const [disconnected, setDisconnected] = useState(false)
  const [loseAck, setLoseAck] = useState(false)
  const [slowSend, setSlowSend] = useState(false)
  const [slowOpen, setSlowOpen] = useState(false)
  const sendOptions = useRef({ loseAck, rejectSend, slowOpen, slowSend })
  const { prime, setSendOptions } = useMemo(() => createScenarioPrime(seed), [seed])
  useLayoutEffect(() => {
    const options = { loseAck, rejectSend, slowOpen, slowSend }
    sendOptions.current = options
    setSendOptions(options)
  }, [loseAck, rejectSend, setSendOptions, slowOpen, slowSend])
  const [roster, setRoster] = useState(seed.roster)
  const current = useRef(roster)
  useLayoutEffect(() => {
    current.current = roster
  }, [roster])
  const [reject, setReject] = useState(false)
  const rejecting = useRef(reject)
  useLayoutEffect(() => {
    rejecting.current = reject
  }, [reject])
  const client = useMemo<AgentClient>(() => {
    const update = (next: Roster) => {
      current.current = next
      setRoster(next)
    }
    const creations = new Map<string, string>()
    const command = <A,>(run: () => A | Promise<A>): Promise<AgentResult<A>> =>
      Effect.runPromise(
        Effect.suspend(() => {
          if (rejecting.current) {
            return Effect.succeed<AgentResult<A>>({
              error: "This scenario rejects mutations. Turn rejection off and retry.",
              ok: false,
            })
          }
          return Effect.tryPromise(async () => await run()).pipe(
            Effect.match({
              onFailure: (): AgentResult<A> => ({ error: "Scenario action failed.", ok: false }),
              onSuccess: (value): AgentResult<A> => ({ ok: true, value }),
            }),
          )
        }),
      )
    return {
      remove: (input) => command(() => {
        const roster = current.current
        update({ ...roster,
          agents: roster.agents.filter((agent) => agent.id !== input.agentId),
          associations: roster.associations.filter((item) => item.agentId !== input.agentId),
          selectedAgentId: roster.selectedAgentId === input.agentId ? null : roster.selectedAgentId,
        })
      }),
      assign: (input) =>
        command((): undefined => {
          const existing = current.current.associations.find(
            (item) => item.sessionId === input.sessionId,
          )
          update({
            ...current.current,
            associations: [
              ...current.current.associations.filter((item) => item.sessionId !== input.sessionId),
              { ...existing, ...input, visitedAt: existing?.visitedAt ?? Date.now() },
            ],
            selectedAgentId: input.agentId,
          })
        }),
      bindRoot: () =>
        Promise.resolve({
          error: "Native binding requires a connected runtime.",
          ok: false as const,
        }),
      chooseWorkspace: () => command(() => Promise.resolve("/example/chosen-folder")),
      createConversation: (input) =>
        command(async () => {
          const previous = creations.get(input.requestId)
          if (previous) {
            await prime.selectSession({ sessionId: previous })
            return previous
          }
          const session = await prime.createSession({
            cwd: "/example/workspace",
            name: "New conversation",
          })
          creations.set(input.requestId, session.id)
          update({
            ...current.current,
            associations: [
              ...current.current.associations,
              { agentId: input.agentId, sessionId: session.id, visitedAt: Date.now() },
            ],
            selectedAgentId: input.agentId,
          })
          await prime.selectSession({ sessionId: session.id })
          if (sendOptions.current.slowOpen) {
            await Effect.runPromise(Effect.sleep(4000))
          }
          return session.id
        }),
      openConversation: (input) =>
        command(async (): Promise<undefined> => {
          await prime.selectSession(input)
          update({
            ...current.current,
            associations: current.current.associations.map((item) =>
              item.sessionId === input.sessionId ? { ...item, visitedAt: Date.now() } : item,
            ),
            selectedAgentId:
              current.current.associations.find((item) => item.sessionId === input.sessionId)
                ?.agentId ?? null,
          })
        }),
      pin: (input) =>
        command((): undefined => {
          update({
            ...current.current,
            agents: current.current.agents.map((agent) =>
              agent.id === input.agentId ? { ...agent, pinned: input.pinned } : agent,
            ),
          })
        }),
      save: (input) =>
        command(() => {
          const previous = current.current.agents.find((agent) => agent.id === input.id)
          const agent: Agent = {
            ...input,
            createdAt: previous?.createdAt ?? Date.now(),
            instructionRevision: 1,
            pinned: previous?.pinned ?? false,
            revision: (previous?.revision ?? 0) + 1,
          }
          update({
            ...current.current,
            agents: [...current.current.agents.filter((item) => item.id !== agent.id), agent],
          })
          return Promise.resolve(agent)
        }),
      select: (input) =>
        command(async (): Promise<undefined> => {
          const [latest] = current.current.associations
            .filter((item) => item.agentId === input.agentId)
            .toSorted((a, b) => b.visitedAt - a.visitedAt)
          await prime.selectSession(latest ? { sessionId: latest.sessionId } : {})
          update({ ...current.current, selectedAgentId: input.agentId })
        }),
    }
  }, [prime])
  return (
    <>
      <div {...stylex.props(styles.toolbar)}>
        <label>
          <input
            type="checkbox"
            checked={slowOpen}
            onChange={(event) => setSlowOpen(event.target.checked)}
          />{" "}
          Slow creation and attachment (4s each)
        </label>
      </div>
      <div {...stylex.props(styles.toolbar)}>
        <label>
          <input
            type="checkbox"
            checked={reject}
            onChange={(event) => setReject(event.target.checked)}
          />{" "}
          Reject mutations
        </label>
        <label>
          <input
            type="checkbox"
            checked={rejectSend}
            onChange={(event) => setRejectSend(event.target.checked)}
          />{" "}
          Reject sends
        </label>
        <label>
          <input
            type="checkbox"
            checked={slowSend}
            onChange={(event) => setSlowSend(event.target.checked)}
          />{" "}
          Slow sends (4s)
        </label>
        <label>
          <input
            type="checkbox"
            checked={loseAck}
            onChange={(event) => setLoseAck(event.target.checked)}
          />{" "}
          Lose send acknowledgement
        </label>
        <label>
          <input
            type="checkbox"
            checked={disconnected}
            onChange={(event) => {
              const isDisconnected = event.target.checked
              setDisconnected(isDisconnected)
              prime.setTransport(
                isDisconnected
                  ? { error: "Synthetic daemon disconnect", status: "failed" }
                  : { status: "connected" },
              )
            }}
          />{" "}
          Disconnect Prime Agent
        </label>
        <span>Switching scenarios resets fixture state.</span>
      </div>
      <div {...stylex.props(styles.app)}>
        <PrimeAgentStateProvider
          client={prime}
          getWorkspacePath={() => Promise.resolve("/example/workspace")}
        >
          <App roster={roster} agentClient={client} />
        </PrimeAgentStateProvider>
      </div>
    </>
  )
}

/** Isolated production UI scenarios. No scenario client can reach a live session. */
const AgentRosterScenarios = () => {
  const [preset, setPreset] = useState<Preset>("Populated")
  return (
    <div {...stylex.props(styles.shell)}>
      <div {...stylex.props(styles.toolbar)}>
        <strong>Development scenario · synthetic data</strong>
        <label>
          Scenario{" "}
          <select
            value={preset}
            onChange={(event) => {
              const next = presets.find((item) => item === event.target.value)
              if (next) {
                setPreset(next)
              }
            }}
          >
            {presets.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      </div>
      <Scenario key={preset} preset={preset} />
    </div>
  )
}

export default AgentRosterScenarios
