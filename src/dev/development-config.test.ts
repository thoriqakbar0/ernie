import assert from "node:assert/strict"
import test from "node:test"

import { readDevConfig, resolveDaemonSocketPath } from "../../scripts/dev/config.ts"
import { parseRuntimeDescriptor } from "./runtime-descriptor.ts"
import { assertRuntimeAttachment } from "../../scripts/dev/runtime.ts"

test("development configuration uses one deterministic default edge", () => {
  const config = readDevConfig([], {}, "/projects/ernie")
  assert.equal(config.role, "all")
  assert.equal(config.host, "127.0.0.1")
  assert.equal(config.port, 4310)
  assert.equal(config.stateRoot, "/projects/ernie/.zenbu/dev/browser")
  assert.equal(config.manageDaemon, true)
})

test("development profiles isolate state while preserving explicit ports", () => {
  const config = readDevConfig(["server"], {
    ERNIE_DEV_PORT: "4410",
    ERNIE_DEV_PROFILE: "second-worktree",
  }, "/projects/ernie")
  assert.equal(config.role, "server")
  assert.equal(config.port, 4410)
  assert.equal(config.stateRoot, "/projects/ernie/.zenbu/dev/second-worktree")
})

test("development can attach to an explicit Prime Agent socket", () => {
  const config = readDevConfig(["server"], {
    ERNIE_PRIME_AGENT_SOCKET: "/tmp/prime-agent.sock",
  }, "/projects/ernie")
  assert.equal(config.daemonSocketPath, "/tmp/prime-agent.sock")
  assert.equal(config.manageDaemon, false)
})

test("invalid development boundary values fail before starting processes", () => {
  assert.throws(() => readDevConfig([], { ERNIE_DEV_PORT: "zero" }, "/projects/ernie"))
  assert.throws(() => readDevConfig([], { ERNIE_DEV_PROFILE: "../shared" }, "/projects/ernie"))
  assert.throws(() => readDevConfig([], { ERNIE_PRIME_AGENT_SOCKET: "relative.sock" }, "/projects/ernie"))
})

test("runtime metadata requires its private authentication coordinate", () => {
  assert.throws(() => parseRuntimeDescriptor({
    version: 1,
    generation: "generation",
    ownerPid: 123,
    origin: "http://127.0.0.1:5000",
  }))
})

test("daemon endpoints use named pipes on Windows", () => {
  assert.equal(
    resolveDaemonSocketPath("C:\\state", "review", "win32"),
    "\\\\.\\pipe\\ernie-prime-agent-review",
  )
})

test("browser attachment requires matching live owner generations", () => {
  const descriptor = parseRuntimeDescriptor({
    version: 1,
    generation: "current",
    ownerPid: 12,
    origin: "http://127.0.0.1:4000",
    authToken: "private",
  })
  assert.doesNotThrow(() => assertRuntimeAttachment(
    descriptor,
    { generation: "current", pid: 11 },
    () => true,
  ))
  assert.throws(() => assertRuntimeAttachment(
    descriptor,
    { generation: "stale", pid: 11 },
    () => true,
  ))
  assert.throws(() => assertRuntimeAttachment(
    descriptor,
    { generation: "current", pid: 11 },
    (pid) => pid !== 12,
  ))
})
