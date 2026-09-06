import { useRef, useState } from "react"
import * as stylex from "@stylexjs/stylex"
import { Effect } from "effect"
import { type Agent, type AgentResult, type Roster, emptyRoster } from "../packages/agents"
import type { PrimeSessionSnapshot, PrimeSessionSummary } from "../packages/prime-agent"
import { createPrimeUsefulSessionFixture } from "../packages/prime-agent/fixtures"
import { createMockPrimeAgentClient } from "./prime-agent/mock"
import { PrimeAgentStateProvider } from "../renderer/prime-agent-state"
import { type AgentClient } from "../renderer/agent-state"
import { App } from "../renderer/components/app"
import { theme } from "../renderer/theme.stylex"

const styles = stylex.create({
  shell: { height: "100%", display: "flex", flexDirection: "column" },
  toolbar: { display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", padding: "8px 14px", fontSize: 12, color: theme["--ink"], backgroundColor: theme["--surface-strong"] },
  app: { flexGrow: 1, minHeight: 0 },
})
const presets = ["Populated", "Empty", "Concurrent activity", "Reconnect", "Failed connection", "Long names", "New Agent", "Draft conversation", "Changed workspace", "Tool activity", "Long conversation"] as const
type Preset = typeof presets[number]

/** Isolated production UI scenarios. No scenario client can reach a live session. */
export default function AgentRosterScenarios() {
  const [preset, setPreset] = useState<Preset>("Populated")
  return <div {...stylex.props(styles.shell)}>
    <div {...stylex.props(styles.toolbar)}><strong>Development scenario · synthetic data</strong>
      <label>Scenario <select value={preset} onChange={(event) => {
        const next = presets.find((item) => item === event.target.value)
        if (next) setPreset(next)
      }}>{presets.map((item) => <option key={item}>{item}</option>)}</select></label>
    </div>
    <Scenario key={preset} preset={preset}/>
  </div>
}
function Scenario({ preset }: { preset: Preset }) {
  const [seed] = useState(() => createSeed(preset))
  const [rejectSend, setRejectSend] = useState(false)
  const [disconnected, setDisconnected] = useState(false)
  const [loseAck, setLoseAck] = useState(false)
  const [slowSend, setSlowSend] = useState(false)
  const [slowOpen, setSlowOpen] = useState(false)
  const sendOptions = useRef({ rejectSend, slowSend, loseAck, slowOpen })
  sendOptions.current = { rejectSend, slowSend, loseAck, slowOpen }
  const [prime] = useState(() => createMockPrimeAgentClient({ initialSnapshots: seed.snapshots, replyDelayMs: 60000,
    beforeAttach: async () => { if (sendOptions.current.slowOpen) await new Promise<void>((resolve) => setTimeout(resolve, 4000)) },
    afterSend: async () => { if (sendOptions.current.loseAck) throw new Error("Synthetic lost acknowledgement") },
    beforePrompt: async () => {
      const options = sendOptions.current
      if (options.slowSend) await new Promise<void>((resolve) => setTimeout(resolve, 4000))
      if (options.rejectSend) throw new Error("Synthetic prompt rejection")
    },
  }))
  const [roster, setRoster] = useState(seed.roster)
  const current = useRef(roster)
  current.current = roster
  const [reject, setReject] = useState(false)
  const rejecting = useRef(reject)
  rejecting.current = reject
  const update = (next: Roster) => { current.current = next; setRoster(next) }
  const [client] = useState<AgentClient>(() => {
    const creations = new Map<string, string>()
    const command = <A,>(run: () => Promise<A>): Promise<AgentResult<A>> => Effect.runPromise(Effect.gen(function* () {
      if (rejecting.current) return { ok: false as const, error: "This scenario rejects mutations. Turn rejection off and retry." }
      return yield* Effect.tryPromise(run).pipe(Effect.match({
        onSuccess: (value): AgentResult<A> => ({ ok: true, value }),
        onFailure: (): AgentResult<A> => ({ ok: false, error: "Scenario action failed." }),
      }))
    }))
    return {
      save: (input) => command(async () => {
        const previous = current.current.agents.find((agent) => agent.id === input.id)
        const agent: Agent = { ...input, revision: (previous?.revision ?? 0) + 1, instructionRevision: 1, pinned: previous?.pinned ?? false, createdAt: previous?.createdAt ?? Date.now() }
        update({ ...current.current, agents: [...current.current.agents.filter((item) => item.id !== agent.id), agent] })
        return agent
      }),
      pin: (input) => command(async (): Promise<undefined> => { update({ ...current.current, agents: current.current.agents.map((agent) => agent.id === input.agentId ? { ...agent, pinned: input.pinned } : agent) }) }),
      select: (input) => command(async (): Promise<undefined> => {
        const latest = [...current.current.associations].filter((item) => item.agentId === input.agentId).sort((a,b) => b.visitedAt - a.visitedAt)[0]
        await prime.selectSession(latest ? { sessionId: latest.sessionId } : {})
        update({ ...current.current, selectedAgentId: input.agentId })
      }),
      openConversation: (input) => command(async (): Promise<undefined> => {
        await prime.selectSession(input)
        update({ ...current.current, selectedAgentId: current.current.associations.find((item) => item.sessionId === input.sessionId)?.agentId ?? null, associations: current.current.associations.map((item) => item.sessionId === input.sessionId ? { ...item, visitedAt: Date.now() } : item) })
      }),
      assign: (input) => command(async (): Promise<undefined> => {
        const existing = current.current.associations.find((item) => item.sessionId === input.sessionId)
        update({ ...current.current, selectedAgentId: input.agentId, associations: [...current.current.associations.filter((item) => item.sessionId !== input.sessionId), { ...existing, ...input, visitedAt: existing?.visitedAt ?? Date.now() }] })
      }),
      createConversation: (input) => command(async () => {
        const previous = creations.get(input.requestId)
        if (previous) { await prime.selectSession({ sessionId: previous }); return previous }
        const session = await prime.createSession({ cwd: "/example/workspace", name: "New conversation" })
        creations.set(input.requestId, session.id)
        update({ ...current.current, selectedAgentId: input.agentId, associations: [...current.current.associations, { sessionId: session.id, agentId: input.agentId, visitedAt: Date.now() }] })
        await prime.selectSession({ sessionId: session.id })
        if (sendOptions.current.slowOpen) await new Promise<void>((resolve) => setTimeout(resolve, 4000))
        return session.id
      }),
    }
  })
  return <>
    <div {...stylex.props(styles.toolbar)}><label><input type="checkbox" checked={slowOpen} onChange={(event) => setSlowOpen(event.target.checked)}/> Slow creation and attachment (4s each)</label></div>
    <div {...stylex.props(styles.toolbar)}><label><input type="checkbox" checked={reject} onChange={(event) => setReject(event.target.checked)}/> Reject mutations</label><label><input type="checkbox" checked={rejectSend} onChange={(event) => setRejectSend(event.target.checked)}/> Reject sends</label><label><input type="checkbox" checked={slowSend} onChange={(event) => setSlowSend(event.target.checked)}/> Slow sends (4s)</label><label><input type="checkbox" checked={loseAck} onChange={(event) => setLoseAck(event.target.checked)}/> Lose send acknowledgement</label><label><input type="checkbox" checked={disconnected} onChange={(event) => { const disconnected = event.target.checked; setDisconnected(disconnected); prime.setTransport(disconnected ? { status: "failed", error: "Synthetic daemon disconnect" } : { status: "connected" }) }}/> Disconnect Prime Agent</label><span>Switching scenarios resets fixture state.</span></div>
    <div {...stylex.props(styles.app)}><PrimeAgentStateProvider client={prime} getWorkspacePath={async () => "/example/workspace"}><App roster={roster} agentClient={client}/></PrimeAgentStateProvider></div>
  </>
}
function createSeed(preset: Preset): { roster: Roster; snapshots: PrimeSessionSnapshot[] } {
  if (preset === "Empty") return { roster: emptyRoster, snapshots: [] }
  const agents: Agent[] = ["Robot", "Eyes", "Coffee", "Star"].map((name, index) => ({
    id: `agent-${index}`, name: preset === "Long names" && index === 0 ? "Robot who remembers to ask a very specific question before every ambitious project" : name,
    avatar: (["fern", "tide", "ember", "iris"] as const)[index % 4], role: ["Code and careful questions", "Research and observation", "Thoughtful writing", "Visual design and storytelling"][index] ?? "",
    cwd: "/example/workspace", instructions: "Synthetic scenario instructions", provider: "", model: "", revision: 1, instructionRevision: 1, pinned: index === 0, createdAt: index,
  }))
  const summaries: PrimeSessionSummary[] = Array.from({ length: 6 }, (_, index) => ({
    id: `scenario-${index}`, name: ["Review the navigation", "Sketching the next idea", "Read the evidence", "A quiet draft", "Prepare the release notes", "Earlier unassigned work"][index], cwd: index === 5 ? "/example/earlier-work" : "/example/workspace", lifecycle: "live",
    state: preset === "Concurrent activity" && index < 2 ? "working" : preset === "Concurrent activity" && index === 2 ? "recovering" : "idle",
    workerFailed: preset === "Concurrent activity" && index === 3,
    activitySummary: index === 0 || index === 2 ? "Reading the navigation contract" : undefined,
    activityAt: `2026-09-05T10:0${index}:00Z`,
  }))
  if (preset === "New Agent") return { roster: { agents, selectedAgentId: agents[3].id, associations: [] }, snapshots: [] }
  const draftConversation = preset === "Draft conversation" || preset === "Changed workspace"
  if (draftConversation) summaries[0] = { ...summaries[0], lifecycle: "draft" }
  if (preset === "Changed workspace") agents[0] = { ...agents[0], cwd: "/example/new-default" }
  const snapshots = summaries.map((session): PrimeSessionSnapshot => {
    const messages = draftConversation && session.id === summaries[0].id ? [] : preset === "Long conversation" ? Array.from({ length: 35 }, (_, index) => ({ id: `${session.id}-${index}`, role: index % 2 ? "assistant" as const : "user" as const, content: `Message ${index + 1}. ` + "Inspect the login flow and preserve the existing workspace context. ".repeat(8) })) : [{ id: `${session.id}-message`, role: "assistant" as const, content: "What would you like to work on? This is a synthetic conversation; no live commands are sent." }]
    const fixture = createPrimeUsefulSessionFixture(session, messages)
    const useful = preset === "Tool activity" ? { ...fixture, structuredMessages: [...fixture.structuredMessages, { role: "toolResult", toolCallId: "example-read", toolName: "read", isError: false, content: [{ type: "text", text: "Synthetic output: the login form validates the email before submitting." }] }, { role: "toolResult", toolCallId: "example-check", toolName: "bash", isError: true, content: [{ type: "text", text: "Synthetic output: the login check failed because the fixture has no server." }] }] } : fixture
    return { session, messages, useful, transport: preset === "Reconnect" ? { status: "reconnecting" } : preset === "Failed connection" ? { status: "failed", error: "Synthetic disconnected runtime" } : { status: "connected" } }
  })
  return { snapshots, roster: { agents, selectedAgentId: agents[0].id, associations: summaries.slice(0,5).map((session,index) => ({ sessionId: session.id, agentId: preset === "Concurrent activity" ? agents[0].id : agents[Number(session.id.split("-")[1]) % 4].id, visitedAt: index === 0 ? 10 : index })) } }
}
