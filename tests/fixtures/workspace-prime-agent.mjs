import fs from "node:fs";

const failOnceFile = process.env.ERNIE_FIXTURE_FAIL_ONCE_FILE;
if (failOnceFile && !fs.existsSync(failOnceFile)) {
  fs.writeFileSync(failOnceFile, "failed");
  process.stderr.write("transient catalog startup failure");
  process.exit(1);
}
const root = process.env.ERNIE_FIXTURE_ROOT;
if (process.env.ERNIE_FIXTURE_MALFORMED === "1") {
  process.stdout.write('{"sessions":"not-an-array"}');
  process.exit(0);
}
process.stdout.write(JSON.stringify({ sessions: [
  {
    id: "root-active", lifecycle: "live", activity: "idle", isSessionActive: false,
    activeSessionId: "root-active", sessionId: "root-session", sessionName: "Root",
    cwd: root, isStreaming: false, taskState: "needs_input", runtimeKind: "top-level",
    lastActivityAt: "2026-01-02T00:00:00.000Z"
  },
  {
    id: "child-session", lifecycle: "live", activity: "working", isSessionActive: true,
    sessionId: "child-session", sessionName: "Child", cwd: "/tmp/ernie-feature",
    isStreaming: true, runtimeKind: "subagent", parentActiveSessionId: "root-active",
    parentSessionId: "root-session", rlmChildId: "sub-child", summary: "Implementing"
  },
  {
    id: "outside", lifecycle: "live", activity: "idle", isSessionActive: false,
    sessionId: "outside", cwd: "/tmp/unrelated", isStreaming: false
  }
] }));
