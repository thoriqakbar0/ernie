import fs from "node:fs";

const failOnceFile = process.env.ERNIE_FIXTURE_FAIL_ONCE_FILE;
if (failOnceFile && !fs.existsSync(failOnceFile)) {
  fs.writeFileSync(failOnceFile, "failed");
  process.stderr.write("transient catalog startup failure");
  process.exit(1);
}
const root = process.env.ERNIE_FIXTURE_ROOT;
if (process.env.ERNIE_FIXTURE_EMPTY === "1") {
  process.stdout.write(JSON.stringify({ sessions: [] }));
  process.exit(0);
}
if (process.env.ERNIE_FIXTURE_MALFORMED === "1") {
  process.stdout.write('{"sessions":"not-an-array"}');
  process.exit(0);
}
const extraAgents = process.env.ERNIE_FIXTURE_MANY_AGENTS === "1"
  ? Array.from({ length: 10 }, (_, index) => ({
      id: `extra-${index + 1}`, lifecycle: "live", activity: "idle", isSessionActive: false,
      activeSessionId: `extra-active-${index + 1}`, sessionId: `extra-session-${index + 1}`,
      sessionName: `Review agent ${index + 1}`,
      cwd: process.env.ERNIE_FIXTURE_MANY_WORKTREES === "1" && index < 8 ? `/tmp/ernie-feature-${index + 1}` : root,
      isStreaming: false,
      runtimeKind: "subagent", parentActiveSessionId: "root-active", parentSessionId: "root-session",
      rlmChildId: `sub-extra-${index + 1}`, summary: `Review workspace area ${index + 1}`,
    }))
  : [];
process.stdout.write(JSON.stringify({ sessions: [
  {
    id: "root-active", lifecycle: "live", activity: "idle", isSessionActive: false,
    activeSessionId: "root-active", sessionId: "root-session", sessionName: "Root",
    cwd: root, isStreaming: false, taskState: "needs_input", runtimeKind: "top-level",
    lastActivityAt: "2026-01-02T00:00:00.000Z"
  },
  {
    id: "child-session", lifecycle: "live", activity: "working", isSessionActive: true,
    activeSessionId: "child-active", sessionId: "child-session", sessionName: "Child", cwd: "/tmp/ernie-feature",
    isStreaming: true, runtimeKind: "subagent", parentActiveSessionId: "root-active",
    parentSessionId: "root-session", rlmChildId: "sub-child", summary: "Implementing"
  },
  {
    id: "outside", lifecycle: "live", activity: "idle", isSessionActive: false,
    sessionId: "outside", cwd: "/tmp/unrelated", isStreaming: false
  },
  ...extraAgents,
] }));
