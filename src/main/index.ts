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
import * as SpaceRuntimeRegistry from "./SpaceRuntimeRegistry";
import * as WorkspaceCatalog from "./WorkspaceCatalog";
import * as DevServerCatalog from "./DevServerCatalog";
import * as SessionTranscriptStream from "./SessionTranscriptStream";
import * as ClipboardWriter from "./ClipboardWriter";

if (!app.isPackaged && process.env["ERNIE_ENABLE_CDP"] === "1") {
  app.commandLine.appendSwitch("remote-debugging-address", "127.0.0.1");
  app.commandLine.appendSwitch("remote-debugging-port", "9223");
}

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

const catalogLayer = WorkspaceCatalog.layer({
  repositoryPath: projectPath,
  nodePath: agentNodePath,
  primeAgentCliPath: catalogAgentCliPath,
  projectStorePath: join(app.getPath("userData"), "projects.json"),
  ...(process.env["ERNIE_CATALOG_GIT_PATH"] ? { gitPath: process.env["ERNIE_CATALOG_GIT_PATH"] } : {}),
});

const registryLayer = SpaceRuntimeRegistry.layer({
  nodePath: agentNodePath,
  cliPath: rpcAgentCliPath,
  remoteExtensionPath,
  ...(remoteUvPath === undefined ? {} : { remoteUvPath }),
}).pipe(Layer.provide(catalogLayer));

const applicationLayer = Layer.mergeAll(
  ErnieWindow.layer,
  ClipboardWriter.layer,
  SessionTranscriptStream.layer({ ...(process.env["ERNIE_DAEMON_SOCKET_PATH"] ? { socketPath: process.env["ERNIE_DAEMON_SOCKET_PATH"] } : {}) }),
  catalogLayer,
  registryLayer,
  DevServerCatalog.layer({ ...(process.env["ERNIE_DEV_SERVER_LSOF_PATH"] ? { lsofPath: process.env["ERNIE_DEV_SERVER_LSOF_PATH"] } : {}) }),
);

ErnieApp.program.pipe(Effect.provide(applicationLayer), Effect.orDie, NodeRuntime.runMain);
