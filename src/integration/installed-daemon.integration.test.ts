import assert from "node:assert/strict"
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:net"
import { once } from "node:events"
import { tmpdir } from "node:os"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { promisify } from "node:util"
import test from "node:test"
import { DAEMON_PROTOCOL_INFO, VERSION } from "prime-agent"
import { InstalledPrimeDaemon, isPrimeDaemonAbsent } from "../main/prime-agent/installed-daemon"
import { connectPrimeDaemon } from "../main/prime-agent/daemon-client"
import { runPrimeAgentRecoveryLoop } from "../main/prime-agent/recovery-retry"

// @lat: [[tests#Behavior specifications#Daemon boundary#Installed daemon startup]]
test(
  "installed daemon startup uses a verified executable and preserves its detached lifetime",
  { timeout: 15_000 },
  async (t) => {
    const directory = await mkdtemp(path.join(tmpdir(), "ernie-installed-"))
    const executable = path.join(directory, "prime-agent")
    const socketPath = path.join(directory, "daemon.sock")
    const marker = path.join(directory, "launches")
    const script = `#!${process.execPath}
import { appendFileSync } from 'node:fs';
import { createServer } from 'node:net';
if (process.argv[2] === '--version') { console.log('${VERSION}'); process.exit(0); }
if (process.argv[2] !== '--mode' || process.argv[3] !== 'daemon' || process.argv[4] !== '--daemon-socket') process.exit(2);
appendFileSync(${JSON.stringify(marker)}, JSON.stringify({ internal: 'PRIME_AGENT_INTERNAL_DAEMON_WORKER' in process.env, electron: 'ELECTRON_RUN_AS_NODE' in process.env }) + '\\n');
const peers = new Set();
const server = createServer(socket => {
  peers.add(socket); socket.on('close', () => peers.delete(socket)); socket.on('error', () => {});
  socket.write(JSON.stringify({ type: 'daemon_hello', protocol: ${JSON.stringify(DAEMON_PROTOCOL_INFO)}, appVersion: '${VERSION}', schemaRevision: 26, serverCapabilities: [] }) + '\\n');
  let buffer = '';
  socket.on('data', chunk => { buffer += chunk; if (!buffer.includes('\\n')) return;
    const { command } = JSON.parse(buffer.trim());
    if (command.type === 'shutdown') {
      socket.write(JSON.stringify({ type: 'response', command: 'shutdown', id: command.id, success: true, data: {} }) + '\\n');
      setTimeout(() => { for (const peer of peers) peer.destroy(); server.close(() => process.exit(0)); }, 25);
    }
  });
});
server.listen(process.argv[5]);
setTimeout(() => process.exit(3), 12000).unref();
`
    await writeFile(executable, script)
    await chmod(executable, 0o700)
    const environment = {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      ERNIE_PRIME_AGENT_EXECUTABLE: executable,
      PRIME_AGENT_INTERNAL_DAEMON_WORKER: "1",
    }
    // .mjs lets the fixture run without package metadata or imports from any user project.
    const moduleExecutable = `${executable}.mjs`
    await writeFile(moduleExecutable, script)
    await chmod(moduleExecutable, 0o700)
    environment.ERNIE_PRIME_AGENT_EXECUTABLE = moduleExecutable
    const launcher = new InstalledPrimeDaemon(environment, directory)
    t.after(async () => {
      try {
        const client = await connectPrimeDaemon(socketPath, "external")
        await client.request({ force: true, type: "shutdown" }, 1000)
        client.close()
        await delay(100)
      } catch {
        // The fixture process also owns a bounded self-exit if readiness failed.
      }
      await rm(directory, { force: true, recursive: true })
    })
    assert.equal(await isPrimeDaemonAbsent(socketPath), true)
    const result1 = await launcher.start(socketPath)
    assert.equal(result1.status, "started")
    const result2 = await launcher.start(socketPath)
    assert.equal(result2.status, "started")
    let connected = false
    await runPrimeAgentRecoveryLoop({
      attempt: async () => {
        try {
          const client = await connectPrimeDaemon(socketPath, "external")
          connected = client.isConnected
          client.close()
          return connected
        } catch {
          return false
        }
      },
      remainingAttempts: 10,
      shouldStop: () => false,
      wait: () => delay(100),
    })
    assert.equal(connected, true)
    assert.equal(await isPrimeDaemonAbsent(socketPath), false)
    assert.equal(await readFile(marker, "utf-8"), '{"internal":false,"electron":false}\n')
    const anotherClient = await connectPrimeDaemon(socketPath, "external")
    assert.equal(
      anotherClient.isConnected,
      true,
      "closing Ernie's client leaves the process available",
    )
    anotherClient.close()
  },
)

test("missing, unusable, old, and cancelled installation paths never start a daemon", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "ernie-install-errors-"))
  t.after(() => rm(directory, { force: true, recursive: true }))
  const socketPath = path.join(directory, "daemon.sock")
  const executable = path.join(directory, "prime-agent")
  const env = { ...process.env, ERNIE_PRIME_AGENT_EXECUTABLE: executable }
  const missing = await new InstalledPrimeDaemon(env, directory).start(socketPath)
  assert.equal(missing.status, "not-installed")
  await writeFile(
    executable,
    '#!/bin/sh\nif [ "$1" = "--version" ]; then echo 0.8.1; exit 0; fi\nexit 99\n',
  )
  await chmod(executable, 0o700)
  const incompatible = await new InstalledPrimeDaemon(env, directory).start(socketPath)
  assert.equal(incompatible.status, "incompatible")
  await writeFile(executable, "#!/bin/sh\nexit 1\n")
  const result3 = await new InstalledPrimeDaemon(env, directory).start(socketPath)
  assert.equal(result3.status, "failed")
  const cancelled = await new InstalledPrimeDaemon(env, directory).start(socketPath, () => true)
  assert.equal(cancelled.status, "failed")
  assert.equal(await isPrimeDaemonAbsent(socketPath), true)
})

test("an accepting endpoint without a greeting is never permission to start another daemon; retries end", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "ernie-no-hello-"))
  const socketPath = path.join(directory, "daemon.sock")
  let connections = 0
  const server = createServer((socket) => {
    connections += 1
    socket.end()
  })
  t.after(async () => {
    await promisify(server.close.bind(server))()
    await rm(directory, { force: true, recursive: true })
  })
  const listening = once(server, "listening")
  server.listen(socketPath)
  await listening
  assert.equal(await isPrimeDaemonAbsent(socketPath), false)
  const before = connections
  await runPrimeAgentRecoveryLoop({
    attempt: async () => {
      try {
        const client = await connectPrimeDaemon(socketPath, "external")
        client.close()
        return true
      } catch {
        return false
      }
    },
    shouldStop: () => false,
    wait: () => delay(10),
  })
  assert.equal(connections - before, 3)
  assert.equal(server.listening, true)
})
