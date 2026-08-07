for (const stream of [process.stdout, process.stderr]) {
  stream.on("error", (error: NodeJS.ErrnoException) => { if (error.code !== "EPIPE") throw error; });
}

import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import { app } from "electron";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { join, resolve } from "node:path";
import * as ErnieApp from "./ErnieApp";
import * as ErnieWindow from "./ErnieWindow";
import * as PrimeAgentRpc from "./PrimeAgentRpc";
import * as WorkspaceCatalog from "./WorkspaceCatalog";
import * as DevServerCatalog from "./DevServerCatalog";
import * as SessionTranscriptStream from "./SessionTranscriptStream";
import * as ClipboardWriter from "./ClipboardWriter";

const runtime = app.isPackaged ? join(process.resourcesPath, "runtime") : join(app.getAppPath(), "assets/runtime");
const projectPath = resolve(process.env["ERNIE_PROJECT_PATH"] || "/Users/thor/work/ernie");
const agentNodePath = process.env["ERNIE_AGENT_NODE_PATH"] || join(runtime, "node");
const runtimeAgentCliPath = join(runtime, "prime-agent", "dist", "bundle", "cli.js");
const rpcAgentCliPath = process.env["ERNIE_AGENT_CLI_PATH"] || runtimeAgentCliPath;
const catalogAgentCliPath = process.env["ERNIE_CATALOG_CLI_PATH"] || runtimeAgentCliPath;
const remoteExtensionPath = app.isPackaged
  ? join(process.resourcesPath, "remote")
  : join(app.getAppPath(), "resources", "remote");
const defaultRemoteUvPath = join(homedir(), ".local", "bin", "uv");
const remoteUvPath = process.env["PRIME_AGENT_REMOTE_UV"] ?? (existsSync(defaultRemoteUvPath) ? defaultRemoteUvPath : undefined);

const applicationLayer = Layer.mergeAll(
  ErnieWindow.layer,
  ClipboardWriter.layer,
  SessionTranscriptStream.layer({ ...(process.env["ERNIE_DAEMON_SOCKET_PATH"] ? { socketPath: process.env["ERNIE_DAEMON_SOCKET_PATH"] } : {}) }),
  DevServerCatalog.layer({ ...(process.env["ERNIE_DEV_SERVER_LSOF_PATH"] ? { lsofPath: process.env["ERNIE_DEV_SERVER_LSOF_PATH"] } : {}) }),
  PrimeAgentRpc.layer({
    nodePath: agentNodePath,
    cliPath: rpcAgentCliPath,
    projectPath,
    remoteExtensionPath,
    ...(remoteUvPath === undefined ? {} : { remoteUvPath }),
  }),
  WorkspaceCatalog.layer({
    repositoryPath: projectPath,
    nodePath: agentNodePath,
    primeAgentCliPath: catalogAgentCliPath,
    ...(process.env["ERNIE_CATALOG_GIT_PATH"] ? { gitPath: process.env["ERNIE_CATALOG_GIT_PATH"] } : {}),
  }),
);

ErnieApp.program.pipe(Effect.provide(applicationLayer), Effect.orDie, NodeRuntime.runMain);
