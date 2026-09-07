import { Service } from "@zenbujs/core/runtime"
import { Schema } from "effect"
import { HistoryRequest } from "../../packages/app-history"
import { callHistory } from "../../host/history/transport"
import { editingGuide } from "../../host/history/agent-guide"
import { AgentsService } from "./agents"
import { createHash } from "node:crypto"

/** Editable UI is a client; storage and approval remain in the bundled parent. */
export class AppHistoryService extends Service.create({ key: "appHistory", deps: { agents: AgentsService } }) {
  async request(input: HistoryRequest): Promise<unknown> {
    const home = process.env.ERNIE_HISTORY_HOME
    if (!home) return { ok: false, error: { code: "unsupported_workspace", message: "App history is available in the installed Ernie app.", nextAction: "Development repositories are not restoration targets." } }
    try { return await callHistory(home, Schema.decodeUnknownSync(HistoryRequest)(input)) }
    catch { return { ok: false, error: { code: "history_unavailable", message: "The bundled history controller is unavailable.", nextAction: "Open Recover Ernie from the native menu." } } }
  }
  /** Opens the dedicated Agent root; every send captures its baseline in PrimeAgentService. */
  async customize() {
    const status = Schema.decodeUnknownSync(Schema.Struct({ ok: Schema.Boolean, value: Schema.optional(Schema.Struct({ workspace: Schema.String, recoveryAvailable: Schema.Boolean })) }))(await this.request({ method: "history.status" }))
    if (!status.ok || !status.value?.recoveryAvailable) return { ok: false as const, error: "Open the installed Ernie app to customize it with recovery." }
    const workspace = status.value.workspace
    const id = `ernie-customization-${createHash("sha256").update(workspace).digest("hex").slice(0, 20)}`
    const roster = await this.ctx.agents.getRoster()
    if (!roster.ok) return roster
    if (roster.value.agents.some(agent => agent.id === id)) return this.ctx.agents.select({ agentId: id })
    return this.ctx.agents.save({ id, expectedRevision: 0, name: "Ernie customizer", avatar: "iris", role: "Customize Ernie", instructions: `${editingGuide}\nBundled CLI executable: ${JSON.stringify(process.env.ERNIE_HISTORY_CLI ?? "Unavailable")}\nUse the CLI with a method name and a JSON argument object, or --mcp for the local adapter.`,
      cwd: workspace, provider: "", model: "" })
  }
}
