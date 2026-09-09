import { homedir } from "node:os"
import path from "node:path"
import { createInterface } from "node:readline"
import { editingGuide } from "./agent-guide"
import { callHistory } from "./transport"

export { callHistory } from "./transport"

const defaultHome = process.env.ERNIE_HISTORY_HOME ?? path.join(homedir(), ".ernie", "app-history")
const required: Readonly<Record<string, readonly string[]>> = {
  "customization.begin": ["requestId"],
  "customization.finish": ["operationId", "summary"],
  "history.checkpoint": ["requestId", "title"],
  "history.diff": ["checkpointId"],
  "history.inspect": ["checkpointId"],
  "history.keep": ["checkpointId", "kept"],
  "history.operation_status": ["operationId"],
  "history.prepare_restore": ["checkpointId", "requestId"],
  "history.request_restore": ["proposalId"],
}
const methods = [
  "history.status",
  "history.list",
  "history.inspect",
  "history.diff",
  "history.checkpoint",
  "history.keep",
  "customization.begin",
  "customization.finish",
  "history.prepare_restore",
  "history.request_restore",
  "history.operation_status",
]
const callTool = async (params: object & { name: string }, home: string) => {
  const toolName = params.name
  const method = methods.find((candidate) => candidate.replaceAll(".", "_") === toolName)
  if (!method) {
    throw new Error("Unknown tool")
  }
  const input = "arguments" in params ? params.arguments : {}
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Expected arguments object")
  }
  const response = await callHistory(home, { ...input, method })
  return {
    content: [{ text: JSON.stringify(response), type: "text" }],
    isError: Boolean(response && typeof response === "object" && "ok" in response && !response.ok),
  }
}

const dispatchRequest = async (request: object & { method: string }, home: string) => {
  let result: unknown
  if (request.method === "initialize") {
    result = {
      capabilities: { resources: {}, tools: {} },
      instructions: editingGuide,
      protocolVersion: "2024-11-05",
      serverInfo: { name: "ernie-history", version: "1.0.0" },
    }
  } else if (request.method === "tools/list") {
    result = {
      tools: methods.map((method) => ({
        description: `${method}. ${method === "history.request_restore" ? "Requests user approval; never activates directly." : "Local app history operation."}`,
        inputSchema: {
          properties: {
            againstCheckpointId: { type: "string" },
            checkpointId: { type: "string" },
            cursor: { type: "string" },
            expectedTree: { type: "string" },
            kept: { type: "boolean" },
            offset: { minimum: 0, type: "integer" },
            operationId: { type: "string" },
            path: { type: "string" },
            proposalId: { type: "string" },
            requestId: { type: "string" },
            summary: { type: "string" },
            title: { type: "string" },
          },
          required: required[method] ?? [],
          type: "object",
        },
        name: method.replaceAll(".", "_"),
      })),
    }
  } else if (request.method === "resources/list") {
    result = {
      resources: [
        { mimeType: "text/markdown", name: "Editing Ernie", uri: "ernie://editing-guide" },
      ],
    }
  } else if (request.method === "resources/read") {
    result = {
      contents: [{ mimeType: "text/markdown", text: editingGuide, uri: "ernie://editing-guide" }],
    }
  } else if (
    request.method === "tools/call" &&
    "params" in request &&
    request.params &&
    typeof request.params === "object" &&
    "name" in request.params &&
    typeof request.params.name === "string"
  ) {
    result = await callTool({ ...request.params, name: request.params.name }, home)
  } else if (request.method === "ping") {
    result = {}
  } else {
    throw new Error("Unsupported method")
  }
  return result
}

/** Shell and stdio MCP adapters share the host protocol; neither can activate a restore. */
export const agentMain = async (args: readonly string[], home = defaultHome) => {
  if (args[0] === "--help" || !args.length) {
    process.stdout.write(
      `${editingGuide}\nCLI: ernie-history <method> [JSON arguments]\nMCP: ernie-history --mcp\n`,
    )
    return
  }
  if (args[0] !== "--mcp") {
    const input: unknown = JSON.parse(args[1] ?? "{}")
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("Expected JSON object")
    }
    process.stdout.write(
      `${JSON.stringify(await callHistory(home, { ...input, method: args[0] }))}\n`,
    )
    return
  }
  const lines = createInterface({ crlfDelay: Infinity, input: process.stdin })
  for await (const line of lines) {
    let id: unknown = null
    try {
      if (Buffer.byteLength(line) > 65_536) {
        throw new Error("Request too large")
      }
      const request: unknown = JSON.parse(line)
      if (
        !request ||
        typeof request !== "object" ||
        !("method" in request) ||
        typeof request.method !== "string"
      ) {
        throw new Error("Invalid request")
      }
      if (!("id" in request)) {
        continue
      }
      ;({ id } = request)
      const result = await dispatchRequest({ ...request, method: request.method }, home)
      process.stdout.write(`${JSON.stringify({ id, jsonrpc: "2.0", result })}\n`)
    } catch {
      process.stdout.write(
        `${JSON.stringify({ error: { code: -32_602, message: "Invalid history request or unavailable local controller. Run ernie-history --help." }, id, jsonrpc: "2.0" })}\n`,
      )
    }
  }
}
