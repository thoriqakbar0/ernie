import { homedir } from "node:os"
import { join } from "node:path"
import { createInterface } from "node:readline"
import { callHistory } from "./transport"
export { callHistory } from "./transport"
import { editingGuide } from "./agent-guide"

const defaultHome = process.env.ERNIE_HISTORY_HOME ?? join(homedir(), ".ernie", "app-history")
const required: Readonly<Record<string, readonly string[]>> = {
  "history.inspect": ["checkpointId"], "history.diff": ["checkpointId"], "history.checkpoint": ["requestId", "title"],
  "history.keep": ["checkpointId", "kept"], "customization.begin": ["requestId"], "customization.finish": ["operationId", "summary"],
  "history.prepare_restore": ["checkpointId", "requestId"], "history.request_restore": ["proposalId"], "history.operation_status": ["operationId"],
}
const methods = ["history.status", "history.list", "history.inspect", "history.diff", "history.checkpoint", "history.keep", "customization.begin", "customization.finish", "history.prepare_restore", "history.request_restore", "history.operation_status"]
/** Shell and stdio MCP adapters share the host protocol; neither can activate a restore. */
export async function agentMain(args: readonly string[], home = defaultHome) {
  if (args[0] === "--help" || !args.length) { process.stdout.write(editingGuide + '\nCLI: ernie-history <method> [JSON arguments]\nMCP: ernie-history --mcp\n'); return }
  if (args[0] !== "--mcp") {
    const input: unknown = JSON.parse(args[1] ?? "{}")
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Expected JSON object")
    process.stdout.write(JSON.stringify(await callHistory(home, { ...input, method: args[0] })) + "\n")
    return
  }
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })
  for await (const line of lines) {
    let id: unknown = null
    try {
      if (Buffer.byteLength(line) > 65536) throw new Error("Request too large")
      const request: unknown = JSON.parse(line)
      if (!request || typeof request !== "object" || !("method" in request) || typeof request.method !== "string") throw new Error("Invalid request")
      if (!("id" in request)) continue
      id = request.id
      let result: unknown
      if (request.method === "initialize") result = { protocolVersion: "2024-11-05", capabilities: { tools: {}, resources: {} }, serverInfo: { name: "ernie-history", version: "1.0.0" }, instructions: editingGuide }
      else if (request.method === "tools/list") result = { tools: methods.map(method => ({ name: method.replaceAll(".", "_"), description: `${method}. ${method === "history.request_restore" ? "Requests user approval; never activates directly." : "Local app history operation."}`, inputSchema: { type: "object", required: required[method] ?? [], properties: { checkpointId: { type: "string" }, requestId: { type: "string" }, operationId: { type: "string" }, proposalId: { type: "string" }, cursor: { type: "string" }, path: { type: "string" }, offset: { type: "integer", minimum: 0 }, expectedTree: { type: "string" }, againstCheckpointId: { type: "string" }, title: { type: "string" }, summary: { type: "string" }, kept: { type: "boolean" } } } })) }
      else if (request.method === "resources/list") result = { resources: [{ uri: "ernie://editing-guide", name: "Editing Ernie", mimeType: "text/markdown" }] }
      else if (request.method === "resources/read") result = { contents: [{ uri: "ernie://editing-guide", mimeType: "text/markdown", text: editingGuide }] }
      else if (request.method === "tools/call" && "params" in request && request.params && typeof request.params === "object" && "name" in request.params && typeof request.params.name === "string") {
        const toolName = request.params.name
        const method = methods.find(method => method.replaceAll(".", "_") === toolName)
        if (!method) throw new Error("Unknown tool")
        const input = "arguments" in request.params ? request.params.arguments : {}
        if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Expected arguments object")
        const response = await callHistory(home, { ...input, method })
        result = { isError: Boolean(response && typeof response === "object" && "ok" in response && !response.ok), content: [{ type: "text", text: JSON.stringify(response) }] }
      } else if (request.method === "ping") result = {}
      else throw new Error("Unsupported method")
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n")
    } catch { process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32602, message: "Invalid history request or unavailable local controller. Run ernie-history --help." } }) + "\n") }
  }
}
