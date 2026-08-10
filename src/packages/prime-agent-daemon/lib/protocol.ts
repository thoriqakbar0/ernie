import type {
  PrimeAgentFailure,
  PrimeAgentFailureCode,
  PrimeAgentGitBranch,
  PrimeAgentModel,
  PrimeAgentModelSelection,
  PrimeAgentResult,
  PrimeAgentRlmDepth,
  PrimeAgentRlmDepthSelection,
  PrimeAgentSession,
  PrimeAgentWorkspace,
} from '../types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function failure(
  code: PrimeAgentFailureCode,
  message: string,
): PrimeAgentResult<never> {
  return { ok: false, error: { code, message } };
}

function parseFailure(value: unknown): PrimeAgentFailure | null {
  if (!isRecord(value)) return null;

  const code = value.code;
  const message = nonEmptyString(value.message);
  if (
    message === null ||
    (code !== 'invalid_request' &&
      code !== 'daemon_unavailable' &&
      code !== 'request_failed' &&
      code !== 'protocol_error')
  ) {
    return null;
  }

  return { code, message };
}

function modelKey(provider: string, id: string): string {
  return JSON.stringify([provider, id]);
}

function pathBasename(path: string): string {
  const segments = path.split(/[\\/]/u).filter((segment) => segment.length > 0);
  return segments.at(-1) ?? path;
}

function parseModel(value: unknown): PrimeAgentModel | null {
  if (!isRecord(value)) return null;

  const id = nonEmptyString(value.id);
  const name = nonEmptyString(value.name);
  const provider = nonEmptyString(value.provider);
  if (id === null || name === null || provider === null) return null;

  return { key: modelKey(provider, id), id, name, provider };
}

function sessionName(value: Record<string, unknown>, cwd: string): string {
  const explicitName = nonEmptyString(value.sessionName);
  if (explicitName !== null) return explicitName;

  const firstMessage = nonEmptyString(value.firstMessage);
  if (firstMessage !== null && firstMessage !== '(no messages)') {
    return firstMessage.length > 64
      ? `${firstMessage.slice(0, 61)}…`
      : firstMessage;
  }

  return pathBasename(cwd);
}

function parseSession(value: unknown): PrimeAgentSession | null {
  if (!isRecord(value)) return null;

  const activeSessionId = nonEmptyString(value.activeSessionId);
  const cwd = nonEmptyString(value.cwd);
  const attachedClients = value.attachedClients;
  if (
    activeSessionId === null ||
    cwd === null ||
    value.runtimeKind === 'subagent' ||
    typeof attachedClients !== 'number' ||
    attachedClients < 1
  ) {
    return null;
  }

  const parsedModel = value.model === undefined ? null : parseModel(value.model);
  if (value.model !== undefined && parsedModel === null) return null;

  return {
    activeSessionId,
    cwd,
    name: sessionName(value, cwd),
    model: parsedModel,
    modifiedAt: nonEmptyString(value.modified),
  };
}

function parseSessionDto(value: unknown): PrimeAgentSession | null {
  if (!isRecord(value)) return null;

  const activeSessionId = nonEmptyString(value.activeSessionId);
  const cwd = nonEmptyString(value.cwd);
  const name = nonEmptyString(value.name);
  if (activeSessionId === null || cwd === null || name === null) return null;

  const parsedModel = value.model === null ? null : parseModel(value.model);
  if (value.model !== null && parsedModel === null) return null;

  const modifiedAt =
    value.modifiedAt === null ? null : nonEmptyString(value.modifiedAt);
  if (value.modifiedAt !== null && modifiedAt === null) return null;

  return {
    activeSessionId,
    cwd,
    name,
    model: parsedModel,
    modifiedAt,
  };
}

function parseModels(value: unknown): readonly PrimeAgentModel[] | null {
  if (!Array.isArray(value)) return null;

  const models: PrimeAgentModel[] = [];
  for (const candidate of value) {
    const model = parseModel(candidate);
    if (model === null) return null;
    models.push(model);
  }
  return models;
}

/** Parse the session list returned by the Prime Agent daemon. */
export function parseSessionListData(
  value: unknown,
): PrimeAgentResult<readonly PrimeAgentSession[]> {
  if (!isRecord(value) || !Array.isArray(value.sessions)) {
    return failure('protocol_error', 'Prime Agent returned an invalid session list.');
  }

  const sessions = value.sessions
    .map(parseSession)
    .filter((session): session is PrimeAgentSession => session !== null)
    .sort((left, right) =>
      (right.modifiedAt ?? '').localeCompare(left.modifiedAt ?? ''),
    );

  return { ok: true, value: sessions };
}

/** Parse the configured model catalog returned by the Prime Agent daemon. */
export function parseModelCatalogData(
  value: unknown,
): PrimeAgentResult<readonly PrimeAgentModel[]> {
  if (!isRecord(value) || !Array.isArray(value.configuredProviders)) {
    return failure('protocol_error', 'Prime Agent returned an invalid model catalog.');
  }

  const configuredProviders = value.configuredProviders
    .map(nonEmptyString)
    .filter((provider): provider is string => provider !== null);
  if (configuredProviders.length !== value.configuredProviders.length) {
    return failure('protocol_error', 'Prime Agent returned an invalid provider list.');
  }

  const models = parseModels(value.models);
  if (models === null) {
    return failure('protocol_error', 'Prime Agent returned invalid model data.');
  }

  const configured = new Set(configuredProviders);
  return {
    ok: true,
    value: models.filter((model) => configured.has(model.provider)),
  };
}

/** Parse one model returned after a Prime Agent model change. */
export function parseModelData(
  value: unknown,
): PrimeAgentResult<PrimeAgentModel> {
  const model = parseModel(value);
  return model === null
    ? failure('protocol_error', 'Prime Agent returned invalid model data.')
    : { ok: true, value: model };
}

/** Parse a model selection received from the isolated renderer. */
export function parseModelSelection(
  value: unknown,
): PrimeAgentResult<PrimeAgentModelSelection> {
  if (!isRecord(value)) {
    return failure('invalid_request', 'The model selection is invalid.');
  }

  const activeSessionId = nonEmptyString(value.activeSessionId);
  const provider = nonEmptyString(value.provider);
  const modelId = nonEmptyString(value.modelId);
  if (activeSessionId === null || provider === null || modelId === null) {
    return failure('invalid_request', 'The model selection is invalid.');
  }

  return { ok: true, value: { activeSessionId, provider, modelId } };
}

/** Parse a session identifier received from the isolated renderer. */
export function parseActiveSessionId(
  value: unknown,
): PrimeAgentResult<string> {
  const activeSessionId = nonEmptyString(value);
  return activeSessionId === null
    ? failure('invalid_request', 'The active session identifier is invalid.')
    : { ok: true, value: activeSessionId };
}

/** Parse RLM maximum-depth state returned by the Prime Agent daemon. */
export function parseRlmDepthData(
  value: unknown,
): PrimeAgentResult<PrimeAgentRlmDepth> {
  if (!isRecord(value)) {
    return failure('protocol_error', 'Prime Agent returned invalid RLM depth data.');
  }

  const maxDepth = value.maxDepth;
  const source = value.source;
  if (
    typeof maxDepth !== 'number' ||
    !Number.isSafeInteger(maxDepth) ||
    maxDepth < 0 ||
    (source !== 'default' &&
      source !== 'env' &&
      source !== 'global' &&
      source !== 'inherited' &&
      source !== 'chat')
  ) {
    return failure('protocol_error', 'Prime Agent returned invalid RLM depth data.');
  }

  return { ok: true, value: { maxDepth, source } };
}

/** Parse an RLM maximum-depth selection from the isolated renderer. */
export function parseRlmDepthSelection(
  value: unknown,
): PrimeAgentResult<PrimeAgentRlmDepthSelection> {
  if (!isRecord(value)) {
    return failure('invalid_request', 'The RLM depth selection is invalid.');
  }

  const activeSessionId = nonEmptyString(value.activeSessionId);
  const maxDepth = value.maxDepth;
  if (
    activeSessionId === null ||
    typeof maxDepth !== 'number' ||
    !Number.isSafeInteger(maxDepth) ||
    maxDepth < 0
  ) {
    return failure('invalid_request', 'The RLM depth selection is invalid.');
  }

  return { ok: true, value: { activeSessionId, maxDepth } };
}

function parseResult<T>(
  value: unknown,
  parseValue: (input: unknown) => T | null,
): PrimeAgentResult<T> {
  if (!isRecord(value) || typeof value.ok !== 'boolean') {
    return failure('protocol_error', 'Ernie received an invalid daemon response.');
  }

  if (!value.ok) {
    const parsedFailure = parseFailure(value.error);
    return parsedFailure === null
      ? failure('protocol_error', 'Ernie received an invalid daemon failure.')
      : { ok: false, error: parsedFailure };
  }

  const parsedValue = parseValue(value.value);
  return parsedValue === null
    ? failure('protocol_error', 'Ernie received invalid daemon data.')
    : { ok: true, value: parsedValue };
}

function parseWorkspace(value: unknown): PrimeAgentWorkspace | null {
  if (!isRecord(value)) return null;
  const currentCwd = nonEmptyString(value.currentCwd);
  if (currentCwd === null || !Array.isArray(value.sessions)) return null;

  const sessions = value.sessions.map(parseSessionDto);
  if (sessions.some((session) => session === null)) return null;

  return {
    currentCwd,
    sessions: sessions.filter(
      (session): session is PrimeAgentSession => session !== null,
    ),
  };
}

function parseGitBranch(value: unknown): PrimeAgentGitBranch | null {
  if (!isRecord(value)) return null;

  const cwd = nonEmptyString(value.cwd);
  const name = value.name === null ? null : nonEmptyString(value.name);
  if (cwd === null || (value.name !== null && name === null)) return null;

  return { cwd, name };
}

/** Parse a workspace path received from the isolated renderer. */
export function parseWorkspaceCwd(value: unknown): PrimeAgentResult<string> {
  const cwd = nonEmptyString(value);
  return cwd === null
    ? failure('invalid_request', 'The workspace path is invalid.')
    : { ok: true, value: cwd };
}

/** Parse a workspace result after it crosses the Electron IPC boundary. */
export function parseWorkspaceResult(
  value: unknown,
): PrimeAgentResult<PrimeAgentWorkspace> {
  return parseResult(value, parseWorkspace);
}

/** Parse a local Git branch result after it crosses the Electron IPC boundary. */
export function parseGitBranchResult(
  value: unknown,
): PrimeAgentResult<PrimeAgentGitBranch> {
  return parseResult(value, parseGitBranch);
}

/** Parse a model-list result after it crosses the Electron IPC boundary. */
export function parseModelsResult(
  value: unknown,
): PrimeAgentResult<readonly PrimeAgentModel[]> {
  return parseResult(value, parseModels);
}

/** Parse a model-change result after it crosses the Electron IPC boundary. */
export function parseModelResult(
  value: unknown,
): PrimeAgentResult<PrimeAgentModel> {
  return parseResult(value, parseModel);
}

function parseRlmDepth(value: unknown): PrimeAgentRlmDepth | null {
  const result = parseRlmDepthData(value);
  return result.ok ? result.value : null;
}

/** Parse an RLM-depth result after it crosses the Electron IPC boundary. */
export function parseRlmDepthResult(
  value: unknown,
): PrimeAgentResult<PrimeAgentRlmDepth> {
  return parseResult(value, parseRlmDepth);
}
