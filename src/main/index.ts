for (const stream of [process.stdout, process.stderr]) {
  stream.on("error", (error: NodeJS.ErrnoException) => { if (error.code !== "EPIPE") throw error; });
}

import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import { app } from "electron";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { join, resolve } from "node:path";
import * as ErnieApp from "./ErnieApp";
import * as ErnieWindow from "./ErnieWindow";
import * as PrimeAgentRpc from "./PrimeAgentRpc";

const runtime = app.isPackaged ? join(process.resourcesPath, "runtime") : join(app.getAppPath(), "assets/runtime");
const projectPath = resolve(process.env["ERNIE_PROJECT_PATH"] || "/Users/thor/work/ernie");

const applicationLayer = Layer.mergeAll(
  ErnieWindow.layer,
  PrimeAgentRpc.layer({
    nodePath: process.env["ERNIE_AGENT_NODE_PATH"] || join(runtime, "node"),
    cliPath: process.env["ERNIE_AGENT_CLI_PATH"] || join(runtime, "prime-agent", "dist", "bundle", "cli.js"),
    projectPath,
  }),
);

ErnieApp.program.pipe(Effect.provide(applicationLayer), Effect.orDie, NodeRuntime.runMain);
