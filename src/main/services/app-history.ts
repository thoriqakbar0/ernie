import { Service } from "@zenbujs/core/runtime"
import { Schema } from "effect"
import { HistoryRequest } from "../../packages/app-history"
import { callHistory } from "../../host/history/transport"
import { editingGuide } from "../../host/history/agent-guide"
import { AgentsService } from "./agents"
import { createHash } from "node:crypto"

/** Editable UI is a client; storage and approval remain in the bundled parent. */
export class AppHistoryService extends Service.create({
  deps: { agents: AgentsService },
  key: "appHistory",
}) {
  async request(input: HistoryRequest): Promise<unknown> {
    const home = process.env.ERNIE_HISTORY_HOME
    if (!home) {
      return {
        error: {
          code: "unsupported_workspace",
          message: "App history is available in the installed Ernie app.",
          nextAction: "Development repositories are not restoration targets.",
        },
        ok: false,
      }
    }
    try {
      return await callHistory(home, Schema.decodeUnknownSync(HistoryRequest)(input))
    } catch {
      return {
        error: {
          code: "history_unavailable",
          message: "The bundled history controller is unavailable.",
          nextAction: "Open Recover Ernie from the native menu.",
        },
        ok: false,
      }
    }
  }
  /** Opens the dedicated Agent root; every send captures its baseline in PrimeAgentService. */
  async customize() {
    const status = Schema.decodeUnknownSync(
      Schema.Struct({
        ok: Schema.Boolean,
        value: Schema.optional(
          Schema.Struct({ recoveryAvailable: Schema.Boolean, workspace: Schema.String }),
        ),
      }),
    )(await this.request({ method: "history.status" }))
    if (!status.ok || !status.value?.recoveryAvailable) {
      return {
        error: "Open the installed Ernie app to customize it with recovery.",
        ok: false as const,
      }
    }
    const { workspace } = status.value
    const id = `ernie-customization-${createHash("sha256").update(workspace).digest("hex").slice(0, 20)}`
    const roster = await this.ctx.agents.getRoster()
    if (!roster.ok) {
      return roster
    }
    if (roster.value.agents.some((agent) => agent.id === id)) {
      return this.ctx.agents.select({ agentId: id })
    }
    return this.ctx.agents.save({
      avatar: "iris",
      cwd: workspace,
      expectedRevision: 0,
      id,
      instructions: `${editingGuide}\nBundled CLI executable: ${JSON.stringify(process.env.ERNIE_HISTORY_CLI ?? "Unavailable")}\nUse the CLI with a method name and a JSON argument object, or --mcp for the local adapter.`,
      model: "",
      name: "Ernie customizer",
      provider: "",
      role: "Customize Ernie",
    })
  }
}
