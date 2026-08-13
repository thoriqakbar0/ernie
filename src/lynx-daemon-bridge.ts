import { spawn } from 'node:child_process';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';

import { Effect } from 'effect';

import type {
  AgentResult,
  AgentSession,
  AgentTaskReceipt,
  AgentWorkspace,
} from './packages/ernie-daemon/client.js';
import {
  createErnieDaemon,
  type AgentHarnessDescriptor,
} from './packages/ernie-daemon/index.js';
import {
  isJsonRecord,
  isJsonString,
  parseJsonValue,
  type JsonValue,
} from './packages/json-value/index.js';
import { createPrimeAgentDaemon } from './packages/prime-agent-daemon/server.js';

const bridgeHost = '127.0.0.1';
const bridgePort = 4_319;
const maximumRequestBytes = 64 * 1_024;

type BridgeFailure = Readonly<{
  error: Readonly<{ code: 'invalid_request'; message: string }>;
  ok: false;
}>;

type BridgeResponse =
  | BridgeFailure
  | AgentResult<AgentSession>
  | AgentResult<AgentTaskReceipt>
  | AgentResult<AgentWorkspace>
  | Readonly<{ ok: true; value: Readonly<{ copied: true }> }>
  | Readonly<{ harness: AgentHarnessDescriptor; ok: true }>;

function parseAnnotationContext(value: JsonValue): string | null {
  if (!isJsonRecord(value)) return null;
  const context = value.context;
  return isJsonString(context) && context.length > 0 && context.length <= 4_096
    ? context
    : null;
}

async function copyToClipboard(context: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('/usr/bin/pbcopy', [], { stdio: ['pipe', 'ignore', 'ignore'] });
    child.once('error', reject);
    child.once('close', code => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error('pbcopy did not accept the annotation context.'));
    });
    child.stdin.end(context);
  });
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  value: BridgeResponse,
): void {
  const serialized = JSON.stringify(value);
  const parsed: unknown = JSON.parse(serialized);
  const json = parseJsonValue(parsed);
  if (json === null && parsed !== null) {
    throw new Error('The bridge response must contain JSON-compatible data.');
  }
  response.writeHead(statusCode, {
    'access-control-allow-origin': '*',
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(json));
}

function invalidRequest(message: string): BridgeFailure {
  return { error: { code: 'invalid_request', message }, ok: false };
}

async function readJsonBody(request: IncomingMessage): Promise<JsonValue> {
  const chunks: Buffer[] = [];
  let byteLength = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    byteLength += buffer.byteLength;
    if (byteLength > maximumRequestBytes) {
      throw new Error('The request body is too large.');
    }
    chunks.push(buffer);
  }

  const source = Buffer.concat(chunks).toString('utf8');
  if (source.length === 0) throw new Error('The request body is empty.');
  const parsed: unknown = JSON.parse(source);
  const value = parseJsonValue(parsed);
  if (value === null && parsed !== null) {
    throw new Error('The request body must contain JSON-compatible data.');
  }
  return value;
}

const daemon = createErnieDaemon({
  descriptor: {
    capabilities: [
      'live-sessions',
      'saved-sessions',
      'models',
      'skills',
      'rlm-depth',
      'refinement',
    ],
    id: 'prime-agent',
    name: 'Prime Agent',
  },
  harness: createPrimeAgentDaemon({
    currentCwd: process.cwd(),
    daemonEntrypointPath: path.join(
      import.meta.dirname,
      'packages/prime-agent-daemon/daemon-runner.js',
    ),
    executablePath: process.execPath,
    sessionNameExtensionPath: path.join(
      import.meta.dirname,
      'packages/session-name-hook/index.js',
    ),
  }),
});

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const url = new URL(request.url ?? '/', `http://${bridgeHost}:${bridgePort}`);

  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'access-control-allow-headers': 'content-type',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-origin': '*',
    });
    response.end();
    return;
  }

  if (request.method === 'GET' && url.pathname === '/v1/health') {
    sendJson(response, 200, { harness: daemon.harness, ok: true });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/v1/workspace') {
    sendJson(response, 200, await Effect.runPromise(daemon.listWorkspace()));
    return;
  }
  if (request.method === 'POST' && url.pathname === '/v1/sessions') {
    sendJson(
      response,
      200,
      await Effect.runPromise(daemon.createSession(await readJsonBody(request))),
    );
    return;
  }
  if (request.method === 'POST' && url.pathname === '/v1/tasks') {
    sendJson(
      response,
      200,
      await Effect.runPromise(daemon.submitTask(await readJsonBody(request))),
    );
    return;
  }
  if (request.method === 'POST' && url.pathname === '/v1/annotations/copy') {
    const context = parseAnnotationContext(await readJsonBody(request));
    if (context === null) {
      sendJson(response, 400, invalidRequest('Annotation context must be a non-empty string.'));
      return;
    }
    await copyToClipboard(context);
    sendJson(response, 200, { ok: true, value: { copied: true } });
    return;
  }

  sendJson(response, 404, invalidRequest('The requested bridge operation does not exist.'));
}

const server = createServer((request, response) => {
  void handleRequest(request, response).catch(() => {
    if (!response.headersSent) {
      sendJson(response, 400, invalidRequest('The bridge could not parse the request.'));
      return;
    }
    response.end();
  });
});

function closeBridge(): void {
  server.close();
  daemon.close();
}

process.once('SIGINT', closeBridge);
process.once('SIGTERM', closeBridge);

server.listen(bridgePort, bridgeHost, () => {
  console.log(`Ernie Lynx daemon bridge listening on http://${bridgeHost}:${bridgePort}`);
});
