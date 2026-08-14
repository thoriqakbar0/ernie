import { chmod } from 'node:fs/promises';
import { createConnection, createServer, type Server, type Socket } from 'node:net';

import {
  isJsonRecord,
  isJsonString,
  parseJsonValue,
  type JsonValue,
} from '../json-value/index.js';

/** Version of Ernie's local UI-control protocol. */
export const ernieUiControlProtocolVersion = 1;

const maximumMessageBytes = 4_096;
const requestTimeoutMs = 1_000;

/** One UI-only command accepted by a running Ernie application. */
export type ErnieUiControlCommand = Readonly<{ type: 'focus' }>;

/** Stable failure codes returned by Ernie UI control. */
export type ErnieUiControlFailureCode =
  | 'app_unavailable'
  | 'internal_error'
  | 'invalid_request'
  | 'invalid_response'
  | 'ui_unavailable';

/** Result of one local Ernie UI-control request. */
export type ErnieUiControlResult =
  | Readonly<{ ok: true; version: 1 }>
  | Readonly<{
      error: Readonly<{
        code: ErnieUiControlFailureCode;
        message: string;
      }>;
      ok: false;
      version: 1;
    }>;

/** Lifecycle handle for Ernie's local UI-control socket. */
export interface ErnieUiControlServer {
  /** Stop accepting UI-control requests and release the socket. */
  readonly close: () => Promise<void>;
  readonly socketPath: string;
}

/** Result of binding Ernie's local UI-control socket. */
export type ErnieUiControlServerStartResult =
  | Readonly<{ ok: true; value: ErnieUiControlServer }>
  | Readonly<{
      error: Readonly<{ code: 'socket_unavailable'; message: string }>;
      ok: false;
    }>;

/** Parsed command-line request for Ernie's UI-control client. */
export type ErnieUiControlCliArgumentsResult =
  | Readonly<{ command: ErnieUiControlCommand; ok: true }>
  | Readonly<{ message: string; ok: false }>;

function failure(
  code: ErnieUiControlFailureCode,
  message: string,
): ErnieUiControlResult {
  return {
    error: { code, message },
    ok: false,
    version: ernieUiControlProtocolVersion,
  };
}

function parseCommand(value: JsonValue | undefined): ErnieUiControlCommand | null {
  return isJsonRecord(value) &&
    Object.keys(value).length === 1 &&
    value.type === 'focus'
    ? { type: 'focus' }
    : null;
}

/** Parse one untrusted local socket value into a UI-control command. */
export function parseErnieUiControlRequest(
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- This function owns the local socket boundary and returns the parsed command.
  value: unknown,
): ErnieUiControlCommand | null {
  const parsed = parseJsonValue(value);
  if (
    !isJsonRecord(parsed) ||
    Object.keys(parsed).length !== 2 ||
    parsed.version !== ernieUiControlProtocolVersion
  ) {
    return null;
  }
  return parseCommand(parsed.command);
}

/** Parse one untrusted local socket value into a UI-control result. */
export function parseErnieUiControlResult(
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- This function owns the local socket boundary and returns the parsed result.
  value: unknown,
): ErnieUiControlResult | null {
  const parsed = parseJsonValue(value);
  if (
    !isJsonRecord(parsed) ||
    parsed.version !== ernieUiControlProtocolVersion
  ) {
    return null;
  }
  if (parsed.ok === true && Object.keys(parsed).length === 2) {
    return { ok: true, version: ernieUiControlProtocolVersion };
  }
  if (
    parsed.ok !== false ||
    Object.keys(parsed).length !== 3 ||
    !isJsonRecord(parsed.error) ||
    Object.keys(parsed.error).length !== 2 ||
    !isJsonString(parsed.error.message)
  ) {
    return null;
  }
  const code = parsed.error.code;
  if (
    code !== 'app_unavailable' &&
    code !== 'internal_error' &&
    code !== 'invalid_request' &&
    code !== 'invalid_response' &&
    code !== 'ui_unavailable'
  ) {
    return null;
  }
  const message = parsed.error.message.trim();
  return message.length === 0 ? null : failure(code, message);
}

/** Parse the intentionally small `ernie ui focus` command surface. */
export function parseErnieUiControlCliArguments(
  arguments_: readonly string[],
): ErnieUiControlCliArgumentsResult {
  const commandArguments =
    arguments_[0] === '--' ? arguments_.slice(1) : arguments_;
  return commandArguments.length === 2 &&
    commandArguments[0] === 'ui' &&
    commandArguments[1] === 'focus'
    ? { command: { type: 'focus' }, ok: true }
    : { message: 'Usage: ernie ui focus', ok: false };
}

function serializeRequest(command: ErnieUiControlCommand): string {
  return `${JSON.stringify({
    command,
    version: ernieUiControlProtocolVersion,
  })}\n`;
}

function parseLine(line: string): JsonValue | undefined {
  try {
    return parseJsonValue(JSON.parse(line));
  } catch {
    return undefined;
  }
}

function handleSocket(
  socket: Socket,
  handleCommand: (command: ErnieUiControlCommand) => ErnieUiControlResult,
): void {
  let received = '';
  let responded = false;

  const respond = (result: ErnieUiControlResult): void => {
    if (responded) return;
    responded = true;
    socket.end(`${JSON.stringify(result)}\n`);
  };

  socket.setTimeout(requestTimeoutMs, () =>
    respond(failure('invalid_request', 'Ernie UI control timed out.')),
  );
  socket.on('error', () => undefined);
  socket.on('data', (chunk) => {
    if (responded) return;
    received += chunk.toString('utf8');
    if (Buffer.byteLength(received, 'utf8') > maximumMessageBytes) {
      respond(failure('invalid_request', 'Ernie UI control request is too large.'));
      return;
    }
    const newlineIndex = received.indexOf('\n');
    if (newlineIndex < 0) return;
    if (received.slice(newlineIndex + 1).trim().length > 0) {
      respond(failure('invalid_request', 'Ernie UI control accepts one request.'));
      return;
    }

    const command = parseErnieUiControlRequest(
      parseLine(received.slice(0, newlineIndex)),
    );
    if (command === null) {
      respond(failure('invalid_request', 'Invalid Ernie UI control request.'));
      return;
    }

    try {
      respond(handleCommand(command));
    } catch {
      respond(failure('internal_error', 'Ernie could not control its UI.'));
    }
  });
}

function closeServer(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

/** Bind an owner-only local socket that accepts UI-control commands. */
export function startErnieUiControlServer(
  socketPath: string,
  handleCommand: (command: ErnieUiControlCommand) => ErnieUiControlResult,
  reportFailure: (message: string) => void,
): Promise<ErnieUiControlServerStartResult> {
  const normalizedPath = socketPath.trim();
  if (normalizedPath.length === 0) {
    return Promise.resolve({
      error: {
        code: 'socket_unavailable',
        message: 'Ernie UI control socket path must not be empty.',
      },
      ok: false,
    });
  }

  return new Promise((resolve) => {
    const server = createServer((socket) => handleSocket(socket, handleCommand));
    let starting = true;
    server.on('error', () => {
      if (!starting) {
        reportFailure('Ernie UI control socket failed.');
        return;
      }
      starting = false;
      resolve({
        error: {
          code: 'socket_unavailable',
          message: 'Ernie could not open its UI control socket.',
        },
        ok: false,
      });
    });
    server.listen(normalizedPath, () => {
      chmod(normalizedPath, 0o600).then(
        () => {
          if (!starting) return;
          starting = false;
          resolve({
            ok: true,
            value: {
              close: () => closeServer(server),
              socketPath: normalizedPath,
            },
          });
        },
        () => {
          if (!starting) return;
          starting = false;
          closeServer(server).then(
            () =>
              resolve({
                error: {
                  code: 'socket_unavailable',
                  message: 'Ernie could not secure its UI control socket.',
                },
                ok: false,
              }),
            () =>
              resolve({
                error: {
                  code: 'socket_unavailable',
                  message: 'Ernie could not close its UI control socket.',
                },
                ok: false,
              }),
          );
        },
      );
    });
  });
}

/** Send one UI-only command to the running Ernie application. */
export function requestErnieUiControl(
  socketPath: string,
  command: ErnieUiControlCommand,
): Promise<ErnieUiControlResult> {
  return new Promise((resolve) => {
    const socket = createConnection(socketPath);
    let received = '';
    let settled = false;

    const finish = (result: ErnieUiControlResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      socket.destroy();
      resolve(result);
    };

    const timeoutId = setTimeout(
      () => finish(failure('app_unavailable', 'Ernie is not responding.')),
      requestTimeoutMs,
    );
    socket.once('connect', () => socket.write(serializeRequest(command)));
    socket.once('error', () =>
      finish(failure('app_unavailable', 'Ernie is not running.')),
    );
    socket.on('data', (chunk) => {
      if (settled) return;
      received += chunk.toString('utf8');
      if (Buffer.byteLength(received, 'utf8') > maximumMessageBytes) {
        finish(failure('invalid_response', 'Ernie returned too much UI data.'));
        return;
      }
      const newlineIndex = received.indexOf('\n');
      if (newlineIndex < 0) return;
      const result = parseErnieUiControlResult(
        parseLine(received.slice(0, newlineIndex)),
      );
      finish(
        result ??
          failure('invalid_response', 'Ernie returned an invalid UI response.'),
      );
    });
    socket.once('close', () => {
      if (!settled) {
        finish(failure('invalid_response', 'Ernie closed UI control early.'));
      }
    });
  });
}
