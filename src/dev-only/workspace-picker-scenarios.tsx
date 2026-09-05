import { useRef, useState } from "react"
import { Effect } from "effect"
import * as stylex from "@stylexjs/stylex"
import type { PrimeSessionSummary } from "../packages/prime-agent"
import { WorkspacePicker } from "../renderer/components/workspace-picker"
import { theme } from "../renderer/theme.stylex"

const styles = stylex.create({
  shell: { padding: 24, color: theme["--ink"], backgroundColor: theme["--surface"], minHeight: "100%" },
  toolbar: { display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", marginBottom: 32 },
})
const cases = ["Populated", "Empty", "Long paths", "Selection failure", "Slow selection"] as const
/** Development-only picker states; no live session commands are sent. */
export default function WorkspacePickerScenarios() {
  const [scenario, setScenario] = useState<typeof cases[number]>("Populated")
  return <main {...stylex.props(styles.shell)}>
    <div {...stylex.props(styles.toolbar)}><strong>Workspace picker · synthetic data</strong><label>Scenario <select value={scenario} onChange={(event) => {
      const next = cases.find((item) => item === event.target.value)
      if (next) setScenario(next)
    }}>{cases.map((item) => <option key={item}>{item}</option>)}</select></label></div>
    <Picker key={scenario} scenario={scenario}/>
  </main>
}
function Picker({ scenario }: { scenario: typeof cases[number] }) {
  const [selected, setSelected] = useState("workspace-0")
  const attempts = useRef(0)
  const sessions: PrimeSessionSummary[] = scenario === "Empty" ? [] : Array.from({length: 8}, (_, index) => ({
    id: `workspace-${index}`, cwd: scenario === "Long paths" ? `/Users/example/projects/client-research-and-design/iteration-${index}/a-workspace-with-a-long-name-and-a-specific-purpose` : `/Users/example/work/${["ernie", "ta-0", "research", "writing", "experiments", "website", "notes", "sketches"][index]}`,
    name: `Review ${index === 0 ? "the Agent roster" : "the next iteration"}`, lifecycle: "draft", state: "idle",
  }))
  return <WorkspacePicker activeSessionId={selected} sessions={sessions} onSelectSession={(id) => Effect.runPromise(Effect.gen(function* () {
    yield* Effect.sleep(scenario === "Slow selection" ? "3 seconds" : "200 millis")
    attempts.current += 1
    if (scenario === "Selection failure" && attempts.current === 1) return { ok: false as const, error: "Couldn’t open this conversation. Try again or choose another workspace." }
    setSelected(id)
    return { ok: true as const, value: undefined }
  }))}/>
}
