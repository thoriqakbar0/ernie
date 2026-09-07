import { Schema } from "effect"
import { callHistory } from "../../host/history/transport"
import { HistoryFailure } from "../../packages/app-history"

const statusResult = Schema.Struct({ ok: Schema.Boolean, value: Schema.optional(Schema.Struct({ workspace: Schema.String, recoveryAvailable: Schema.Boolean })) })
const beginResult = Schema.Struct({ ok: Schema.Boolean, value: Schema.optional(Schema.Struct({ id: Schema.String, baselineId: Schema.String, workspace: Schema.String })), error: Schema.optional(Schema.Struct({ message: Schema.String })) })
/** Admission is before native dispatch, so capture failures leave the user's draft unsent. */
export async function admitHistoryTurn(cwd: string, requestId: string) {
  const home = process.env.ERNIE_HISTORY_HOME
  if (!home) return undefined
  if (cwd !== process.env.ERNIE_MANAGED_SOURCE && cwd !== process.env.ERNIE_INITIAL_SOURCE && !cwd.startsWith(`${home}/generations/`)) return undefined
  try {
    const status = Schema.decodeUnknownSync(statusResult)(await callHistory(home, { method: "history.status" }))
    if (!status.ok || !status.value?.recoveryAvailable) throw new Error("History is unavailable")
    if (cwd !== status.value.workspace) {
      throw new Error("This Agent has an inactive app generation. Open Customize Ernie again.")
    }
    const result = Schema.decodeUnknownSync(beginResult)(await callHistory(home, { method: "customization.begin", requestId }))
    if (!result.ok || !result.value) throw new Error(result.error?.message ?? "Checkpoint capture failed")
    const operation = result.value
    if (operation.workspace !== cwd) throw new Error("The managed generation changed. Reopen Customize Ernie before sending.")
    return {
      context: `\n\nErnie history metadata (protocol 1): ${JSON.stringify({ operationId: operation.id, baselineId: operation.baselineId, workspace: operation.workspace })}\nThe host registered this editing operation before sending. Retain these IDs; use the bundled Editing Ernie guide to inspect history or request recovery.`,
      finish: async () => {
        const finished = await callHistory(home, { method: "customization.finish", operationId: operation.id, summary: "Ernie customization" })
        if (!finished || typeof finished !== "object" || !("ok" in finished) || !finished.ok) throw new Error("Customization checkpoint is incomplete. Inspect app history.")
      },
    }
  } catch (cause) {
    throw new HistoryFailure({ code: "capture_failed", message: cause instanceof Error ? cause.message : "App changes could not be protected.", nextAction: "Open App history, resolve capture health, and retry. Your message has not been sent." })
  }
}
