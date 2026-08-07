#!/usr/bin/env node
import process from "node:process";

let carry = "";
let startupDelayUsed = false;
const state = {
  sessionId: "bridge-test-session",
  sessionName: "S".repeat(5000),
  model: { provider: "test-provider", id: "test-model", name: "Test Model", contextWindow: 200000 },
  thinkingLevel: "xhigh",
  isStreaming: false,
  isCompacting: false,
  messageCount: 3,
  sessionActions: { queuedCount: 0 },
  steeringMode: "one-at-a-time",
  followUpMode: "one-at-a-time",
};
const stats = {
  contextUsage: { tokens: 1200, contextWindow: 200000, percent: 1 },
  tokens: { total: 2345 },
  cost: 0.0123,
};

function send(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function respond(request, data = {}) {
  send({ type: "response", id: request.id, command: request.type, success: true, data });
}

function handle(request) {
  if (request.type === "get_state" && !startupDelayUsed && process.env.ERNIE_FAKE_STARTUP_DELAY_MS) {
    startupDelayUsed = true;
    setTimeout(() => respond(request, state), Number(process.env.ERNIE_FAKE_STARTUP_DELAY_MS));
    return;
  }
  if (request.type === "get_state" && process.env.ERNIE_FAKE_MODE === "unterminated") {
    process.stdout.write(JSON.stringify({ type: "response", id: request.id, command: request.type, success: true, data: state }));
    process.stdout.end();
    setTimeout(() => process.exit(0), 10);
    return;
  }
  if (request.type === "get_state") return respond(request, state);
  if (request.type === "get_session_stats") return respond(request, stats);
  if (request.type === "get_commands") return respond(request, { commands: [
    { name: "skill:research", description: "Research a topic from primary sources", source: "skill" },
    { name: "fix-tests", description: "Run and repair the project test suite", source: "prompt" },
    { name: "session-name", description: "Rename the current session", source: "extension" },
  ] });
  if (request.type === "prompt") {
    send({
      type: "fake_prompt_received",
      byteLength: Buffer.byteLength(request.message, "utf8"),
      allX: /^x+$/.test(request.message),
      streamingBehavior: request.streamingBehavior || "now",
    });
    if (process.env.ERNIE_FAKE_MODE === "missing-message-end") {
      send({ type: "agent_start" });
      send({ type: "message_start", message: { role: "assistant", content: [] } });
      send({ type: "message_update", assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "partial" } });
      send({ type: "agent_end", messages: [{ role: "assistant" }] });
      send({ type: "agent_start" });
      send({ type: "message_start", message: { role: "assistant", content: [] } });
      send({ type: "message_end", message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "next" }] } });
      send({ type: "agent_end", messages: [{ role: "assistant" }] });
    }
    if (process.env.ERNIE_FAKE_MODE === "invalid-index") {
      send({ type: "message_start", message: { role: "assistant", content: [] } });
      send({ type: "message_update", assistantMessageEvent: { type: "text_delta", contentIndex: -1, delta: "must not render" } });
      send({ type: "message_end", message: { role: "assistant", stopReason: "stop", content: [] } });
    }
    if (process.env.ERNIE_FAKE_MODE === "lifecycle") {
      send({ type: "agent_start" });
      send({ type: "turn_start" });
      send({ type: "message_start", message: { role: "assistant", content: [] } });
      for (let index = 0; index < 100; index += 1) {
        send({
          type: "message_update",
          assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "A".repeat(50) },
        });
      }
      send({
        type: "message_end",
        message: { role: "assistant", stopReason: "toolUse", content: [{ type: "text", text: "A".repeat(5000) }] },
      });
      send({
        type: "tool_execution_start",
        toolCallId: "call-1",
        toolName: "read",
        args: { path: "/tmp/example.txt" },
      });
      send({
        type: "tool_execution_update",
        toolCallId: "call-1",
        partialResult: { content: [{ type: "text", text: "partial output" }] },
      });
      send({
        type: "tool_execution_end",
        toolCallId: "call-1",
        result: { content: [{ type: "text", text: "final output" }] },
        isError: false,
      });
      send({ type: "message_start", message: { role: "toolResult", content: [] } });
      send({ type: "message_end", message: { role: "toolResult", content: [] } });
      send({ type: "turn_end", message: { role: "assistant" }, toolResults: [{}] });
      send({ type: "turn_start" });
      send({ type: "message_start", message: { role: "assistant", content: [] } });
      send({ type: "message_end", message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "done" }] } });
      send({ type: "turn_end", message: { role: "assistant" }, toolResults: [] });
      send({ type: "agent_end", messages: [{ role: "assistant" }] });
    }
    return respond(request);
  }
  if (request.type === "new_session") return respond(request, { cancelled: false });
  if (request.type === "abort" && request.id === "bridge-internal-shutdown-abort") return;
  respond(request);
}

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  carry += chunk;
  for (;;) {
    const newline = carry.indexOf("\n");
    if (newline < 0) break;
    const line = carry.slice(0, newline).replace(/\r$/, "");
    carry = carry.slice(newline + 1);
    if (line.length > 0) handle(JSON.parse(line));
  }
});
process.stdin.on("end", () => process.exit(0));
