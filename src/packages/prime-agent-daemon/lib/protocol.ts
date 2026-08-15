import type {
  PrimeAgentFailure,
  PrimeAgentFailureCode,
  PrimeAgentGitBranches,
  PrimeAgentGitBranchRename,
  PrimeAgentGitBranchSelection,
  PrimeAgentGitWorkspace,
  PrimeAgentGitWorktree,
  PrimeAgentGitWorktreeCreation,
  PrimeAgentIpythonAttachment,
  PrimeAgentConfiguration,
  PrimeAgentModel,
  PrimeAgentModelCatalogScope,
  PrimeAgentModelSelection,
  PrimeAgentResult,
  PrimeAgentRefinementReceipt,
  PrimeAgentRefinementRequest,
  PrimeAgentRlmDepth,
  PrimeAgentRlmDepthSelection,
  PrimeAgentSavedSession,
  PrimeAgentSession,
  PrimeAgentSessionActivity,
  PrimeAgentSessionCreation,
  PrimeAgentSessionHistoryPage,
  PrimeAgentSessionHistoryRequest,
  PrimeAgentSessionRename,
  PrimeAgentSessionRenameReceipt,
  PrimeAgentChatMessage,
  PrimeAgentSessionView,
  PrimeAgentSpawnedSession,
  PrimeAgentSkill,
  PrimeAgentTaskReceipt,
  PrimeAgentTaskSubmission,
  PrimeAgentThinkingLevel,
  PrimeAgentThinkingLevelSelection,
  PrimeAgentTranscriptItem,
  PrimeAgentWorkspace,
} from '../types.js';
import {
  isJsonBoolean,
  isJsonNumber,
  isJsonRecord,
  isJsonString,
  type JsonRecord,
  type JsonValue,
} from '../../json-value/index.js';

function nonEmptyString(value: JsonValue | undefined): string | null {
  if (!isJsonString(value)) return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function textContent(value: JsonValue | undefined): string {
  if (isJsonString(value)) return value.trim();
  if (!Array.isArray(value)) return '';
  return value
    .flatMap((part) =>
      isJsonRecord(part) && part.type === 'text' && isJsonString(part.text)
        ? [part.text]
        : [],
    )
    .join('\n')
    .trim();
}

function optionalText(value: JsonValue | undefined): string | null {
  return isJsonString(value) && value.length > 0 ? value : null;
}

function optionalDuration(value: JsonValue | undefined): number | null {
  return isJsonNumber(value) && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function tracebackLines(value: JsonValue | undefined): readonly string[] {
  return Array.isArray(value)
    ? value.filter(isJsonString)
    : [];
}

function ipythonAttachments(
  value: JsonValue | undefined,
): readonly PrimeAgentIpythonAttachment[] {
  if (!Array.isArray(value)) return [];
  const attachments: PrimeAgentIpythonAttachment[] = [];
  for (const attachment of value) {
    if (!isJsonRecord(attachment)) continue;
    const mimeType = attachment.mimeType;
    const data = nonEmptyString(attachment.data);
    if (
      data === null ||
      (mimeType !== 'image/gif' &&
        mimeType !== 'image/jpeg' &&
        mimeType !== 'image/png' &&
        mimeType !== 'image/webp')
    ) {
      continue;
    }
    attachments.push({
      data,
      mimeType,
      path: optionalText(attachment.path),
    });
  }
  return attachments;
}

/** Parse one focused attach snapshot into Ernie's narrow chat projection. */
export function parseSessionViewData(
  value: JsonValue,
  rlmDepthValue: JsonValue,
): PrimeAgentResult<PrimeAgentSessionView> {
  if (!isJsonRecord(value) || !isJsonRecord(value.snapshot)) {
    return failure(
      'protocol_error',
      'Prime Agent returned an invalid chat snapshot.',
    );
  }

  const activeSessionId = nonEmptyString(value.snapshot.activeSessionId);
  if (activeSessionId === null || !Array.isArray(value.snapshot.messages)) {
    return failure(
      'protocol_error',
      'Prime Agent returned an invalid chat snapshot.',
    );
  }

  const rlmDepth = parseRlmDepthData(rlmDepthValue);
  if (!rlmDepth.ok) return rlmDepth;

  const messages: PrimeAgentChatMessage[] = [];
  const transcript: PrimeAgentTranscriptItem[] = [];
  const ipythonIndexById = new Map<string, number>();
  value.snapshot.messages.forEach((message, index) => {
    if (!isJsonRecord(message)) return;

    if (message.role === 'toolResult') {
      const toolCallId = nonEmptyString(message.toolCallId);
      const transcriptIndex =
        toolCallId === null ? undefined : ipythonIndexById.get(toolCallId);
      if (transcriptIndex === undefined) return;

      const pending = transcript[transcriptIndex];
      if (pending?.kind !== 'ipython') return;
      const details = isJsonRecord(message.details) ? message.details : null;
      const rawStatus = details?.status;
      const status =
        rawStatus === 'ok' ||
        rawStatus === 'error' ||
        rawStatus === 'aborted' ||
        rawStatus === 'starting'
          ? rawStatus
          : message.isError === true
            ? 'error'
            : 'ok';
      const error = details !== null && isJsonRecord(details.error)
        ? details.error
        : null;
      transcript[transcriptIndex] = {
        ...pending,
        attachments: ipythonAttachments(details?.attachments),
        durationMs: optionalDuration(details?.durationMs),
        result: optionalText(details?.result) ?? optionalText(textContent(message.content)),
        status,
        stderr:
          optionalText(details?.stderr) ??
          (error === null
            ? null
            : [nonEmptyString(error.ename), nonEmptyString(error.evalue)]
                .filter((part): part is string => part !== null)
                .join(': ') || null),
        stdout: optionalText(details?.stdout),
        traceback: tracebackLines(error?.traceback),
      };
      return;
    }

    if (message.role !== 'user' && message.role !== 'assistant') return;
    const text = textContent(message.content);
    if (text.length > 0) {
      const chatMessage = {
        id: `${activeSessionId}:${index}`,
        role: message.role,
        text,
      } as const;
      messages.push(chatMessage);
    }

    if (message.role === 'user') {
      if (text.length > 0) {
        transcript.push({
          id: `${activeSessionId}:${index}`,
          kind: 'message',
          role: 'user',
          text,
        });
      }
      return;
    }

    if (!Array.isArray(message.content)) {
      if (text.length > 0) {
        transcript.push({
          id: `${activeSessionId}:${index}:text:0`,
          kind: 'message',
          role: 'assistant',
          text,
        });
      }
      return;
    }

    message.content.forEach((part, partIndex) => {
      if (!isJsonRecord(part)) return;
      if (part.type === 'text') {
        const partText = nonEmptyString(part.text);
        if (partText !== null) {
          transcript.push({
            id: `${activeSessionId}:${index}:text:${partIndex}`,
            kind: 'message',
            role: 'assistant',
            text: partText,
          });
        }
        return;
      }
      if (
        part.type !== 'toolCall' ||
        part.name !== 'ipython' ||
        !isJsonRecord(part.arguments)
      ) {
        return;
      }
      const id = nonEmptyString(part.id);
      const code = optionalText(part.arguments.code);
      if (id === null || code === null) return;
      ipythonIndexById.set(id, transcript.length);
      transcript.push({
        attachments: [],
        code,
        durationMs: null,
        id,
        kind: 'ipython',
        result: null,
        status: 'running',
        stderr: null,
        stdout: null,
        traceback: [],
      });
    });
  });

  const snapshotState = isJsonRecord(value.snapshot.state)
    ? value.snapshot.state
    : null;
  if (
    snapshotState !== null &&
    snapshotState.isStreaming !== undefined &&
    !isJsonBoolean(snapshotState.isStreaming)
  ) {
    return failure('protocol_error', 'Prime Agent returned invalid session state.');
  }
  const isStreaming = snapshotState?.isStreaming === true;
  const focusedSessionName = nonEmptyString(snapshotState?.sessionName);

  const children = value.snapshot.children;
  if (children !== undefined && !Array.isArray(children)) {
    return failure('protocol_error', 'Prime Agent returned invalid spawned sessions.');
  }
  const spawnedSessions: PrimeAgentSpawnedSession[] = [];
  for (const child of children ?? []) {
    if (!isJsonRecord(child)) {
      return failure('protocol_error', 'Prime Agent returned invalid spawned sessions.');
    }
    const id = nonEmptyString(child.id);
    const name = nonEmptyString(child.sessionName);
    const parentId =
      child.parentId === undefined ? null : nonEmptyString(child.parentId);
    const rawStatus = child.status;
    const status =
      rawStatus === 'running'
        ? 'working'
        : rawStatus === 'queued' ||
            rawStatus === 'done' ||
            rawStatus === 'error' ||
            rawStatus === 'cancelled'
          ? rawStatus
          : null;
    if (
      id === null ||
      status === null ||
      (child.parentId !== undefined && parentId === null)
    ) {
      return failure('protocol_error', 'Prime Agent returned invalid spawned sessions.');
    }
    if (name !== null) {
      const activity = isJsonRecord(child.activity)
        ? nonEmptyString(child.activity.toolName) ?? nonEmptyString(child.activity.kind)
        : null;
      spawnedSessions.push({
        activeSessionId: nonEmptyString(child.activeSessionId),
        activity,
        durationMs: optionalDuration(child.durationMs),
        error: optionalText(child.error),
        id,
        name,
        parentId,
        recap: optionalText(child.recap) ?? optionalText(child.answerPreview),
        status,
      });
    }
  }

  return {
    ok: true,
    value: {
      activeSessionId,
      historyStart: 0,
      isStreaming,
      messages,
      rlmMaxDepth: rlmDepth.value.maxDepth,
      sessionName: focusedSessionName,
      spawnedSessions,
      transcript,
    },
  };
}

function parseSessionViewDto(
  value: JsonValue | undefined,
): PrimeAgentSessionView | null {
  if (
    !isJsonRecord(value) ||
    !Array.isArray(value.messages) ||
    !Array.isArray(value.spawnedSessions) ||
    !Array.isArray(value.transcript)
  ) {
    return null;
  }
  const activeSessionId = nonEmptyString(value.activeSessionId);
  const historyStart = value.historyStart;
  const rlmMaxDepth = value.rlmMaxDepth;
  if (
    activeSessionId === null ||
    !isJsonNumber(historyStart) ||
    !Number.isSafeInteger(historyStart) ||
    historyStart < 0 ||
    !isJsonBoolean(value.isStreaming) ||
    !isJsonNumber(rlmMaxDepth) ||
    !Number.isSafeInteger(rlmMaxDepth) ||
    rlmMaxDepth < 0
  ) {
    return null;
  }

  const messages: PrimeAgentChatMessage[] = [];
  for (const message of value.messages) {
    if (!isJsonRecord(message)) return null;
    const id = nonEmptyString(message.id);
    const text = nonEmptyString(message.text);
    if (
      id === null ||
      text === null ||
      (message.role !== 'user' && message.role !== 'assistant')
    ) {
      return null;
    }
    messages.push({ id, role: message.role, text });
  }

  const spawnedSessions: PrimeAgentSpawnedSession[] = [];
  for (const session of value.spawnedSessions) {
    if (!isJsonRecord(session)) return null;
    const activeSessionId =
      session.activeSessionId === null
        ? null
        : nonEmptyString(session.activeSessionId);
    const activity =
      session.activity === null ? null : nonEmptyString(session.activity);
    const durationMs =
      session.durationMs === null ? null : optionalDuration(session.durationMs);
    const error = session.error === null ? null : optionalText(session.error);
    const id = nonEmptyString(session.id);
    const name = nonEmptyString(session.name);
    const parentId =
      session.parentId === null ? null : nonEmptyString(session.parentId);
    const recap = session.recap === null ? null : optionalText(session.recap);
    if (
      (session.activeSessionId !== null && activeSessionId === null) ||
      (session.activity !== null && activity === null) ||
      (session.durationMs !== null && durationMs === null) ||
      (session.error !== null && error === null) ||
      id === null ||
      name === null ||
      (session.parentId !== null && parentId === null) ||
      (session.recap !== null && recap === null) ||
      (session.status !== 'queued' &&
        session.status !== 'working' &&
        session.status !== 'done' &&
        session.status !== 'error' &&
        session.status !== 'cancelled')
    ) {
      return null;
    }
    spawnedSessions.push({
      activeSessionId,
      activity,
      durationMs,
      error,
      id,
      name,
      parentId,
      recap,
      status: session.status,
    });
  }

  const transcript: PrimeAgentTranscriptItem[] = [];
  for (const item of value.transcript) {
    if (!isJsonRecord(item)) return null;
    const id = nonEmptyString(item.id);
    if (id === null) return null;
    if (item.kind === 'message') {
      const text = nonEmptyString(item.text);
      if (
        text === null ||
        (item.role !== 'user' && item.role !== 'assistant')
      ) {
        return null;
      }
      transcript.push({ id, kind: 'message', role: item.role, text });
      continue;
    }
    if (item.kind !== 'ipython') return null;
    const attachments = ipythonAttachments(item.attachments);
    const code = optionalText(item.code);
    const durationMs =
      item.durationMs === null ? null : optionalDuration(item.durationMs);
    const result = item.result === null ? null : optionalText(item.result);
    const stderr = item.stderr === null ? null : optionalText(item.stderr);
    const stdout = item.stdout === null ? null : optionalText(item.stdout);
    if (
      code === null ||
      !Array.isArray(item.attachments) ||
      attachments.length !== item.attachments.length ||
      (item.durationMs !== null && durationMs === null) ||
      (item.result !== null && result === null) ||
      (item.stderr !== null && stderr === null) ||
      (item.stdout !== null && stdout === null) ||
      !Array.isArray(item.traceback) ||
      !item.traceback.every(isJsonString) ||
      (item.status !== 'running' &&
        item.status !== 'starting' &&
        item.status !== 'ok' &&
        item.status !== 'error' &&
        item.status !== 'aborted')
    ) {
      return null;
    }
    transcript.push({
      attachments,
      code,
      durationMs,
      id,
      kind: 'ipython',
      result,
      status: item.status,
      stderr,
      stdout,
      traceback: item.traceback,
    });
  }

  const parsedSessionName =
    value.sessionName === null ? null : nonEmptyString(value.sessionName);
  if (value.sessionName !== null && parsedSessionName === null) return null;

  return {
    activeSessionId,
    historyStart,
    isStreaming: value.isStreaming,
    messages,
    rlmMaxDepth,
    sessionName: parsedSessionName,
    spawnedSessions,
    transcript,
  };
}

function failure(
  code: PrimeAgentFailureCode,
  message: string,
): PrimeAgentResult<never> {
  return { ok: false, error: { code, message } };
}

function parseFailure(value: JsonValue | undefined): PrimeAgentFailure | null {
  if (!isJsonRecord(value)) return null;

  const code = value.code;
  const message = nonEmptyString(value.message);
  if (
    message === null ||
    (code !== 'invalid_request' &&
      code !== 'daemon_unavailable' &&
      code !== 'request_failed' &&
      code !== 'outcome_uncertain' &&
      code !== 'unsupported_operation' &&
      code !== 'protocol_error')
  ) {
    return null;
  }

  return { code, message };
}

function modelKey(provider: string, id: string): string {
  return JSON.stringify([provider, id]);
}

const thinkingLevels = [
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const satisfies readonly PrimeAgentThinkingLevel[];

function parseThinkingLevel(
  value: JsonValue | undefined,
): PrimeAgentThinkingLevel | null {
  return thinkingLevels.find((level) => level === value) ?? null;
}

function parseThinkingLevels(
  value: JsonValue | undefined,
): readonly PrimeAgentThinkingLevel[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const parsed: PrimeAgentThinkingLevel[] = [];
  for (const candidate of value) {
    const level = parseThinkingLevel(candidate);
    if (level === null) return null;
    if (!parsed.includes(level)) parsed.push(level);
  }
  return parsed;
}

function modelThinkingLevels(
  value: JsonRecord,
): readonly PrimeAgentThinkingLevel[] | null {
  if (value.thinkingLevels !== undefined) {
    return parseThinkingLevels(value.thinkingLevels);
  }
  if (!isJsonBoolean(value.reasoning)) return null;
  if (!value.reasoning) return ['off'];
  if (
    value.thinkingLevelMap !== undefined &&
    !isJsonRecord(value.thinkingLevelMap)
  ) {
    return null;
  }
  const map = isJsonRecord(value.thinkingLevelMap)
    ? value.thinkingLevelMap
    : null;
  if (
    map !== null &&
    Object.values(map).some(
      (mapped) => mapped !== null && !isJsonString(mapped),
    )
  ) {
    return null;
  }
  return thinkingLevels.filter((level) => {
    const mapped = map?.[level];
    if (mapped === null) return false;
    return level !== 'xhigh' && level !== 'max' ? true : mapped !== undefined;
  });
}

function parseModel(value: JsonValue | undefined): PrimeAgentModel | null {
  if (!isJsonRecord(value)) return null;

  const id = nonEmptyString(value.id);
  const name = nonEmptyString(value.name);
  const provider = nonEmptyString(value.provider);
  const availableThinkingLevels = modelThinkingLevels(value);
  if (
    id === null ||
    name === null ||
    provider === null ||
    availableThinkingLevels === null
  ) {
    return null;
  }

  return {
    key: modelKey(provider, id),
    id,
    name,
    provider,
    thinkingLevels: availableThinkingLevels,
  };
}

function sessionName(value: JsonRecord): string {
  const explicitName = nonEmptyString(value.sessionName);
  if (explicitName !== null) return explicitName;

  const firstMessage = nonEmptyString(value.firstMessage);
  if (firstMessage !== null && firstMessage !== '(no messages)') {
    return firstMessage.length > 64
      ? `${firstMessage.slice(0, 61)}…`
      : firstMessage;
  }

  return 'New Agent';
}

function savedSessionName(value: JsonRecord): string {
  const explicitName = nonEmptyString(value.name);
  if (explicitName !== null) return explicitName;

  const firstMessage = nonEmptyString(value.firstMessage);
  if (firstMessage !== null && firstMessage !== '(no messages)') {
    return firstMessage.length > 64
      ? `${firstMessage.slice(0, 61)}…`
      : firstMessage;
  }

  return 'New Agent';
}

function parseSessionActivity(
  value: JsonRecord,
): PrimeAgentSessionActivity | null {
  const activity = value.activity;
  const sessionActions = value.sessionActions;
  const activeAction = isJsonRecord(sessionActions)
    ? sessionActions.active
    : undefined;
  const validActiveAction =
    activeAction === undefined ||
    (isJsonRecord(activeAction) &&
      (activeAction.phase === 'preparing' ||
        activeAction.phase === 'committing' ||
        activeAction.phase === 'running'));
  if (
    (activity !== 'working' && activity !== 'idle') ||
    !isJsonBoolean(value.isSessionActive) ||
    !isJsonBoolean(value.isStreaming) ||
    !isJsonBoolean(value.isCompacting) ||
    !isJsonRecord(sessionActions) ||
    !validActiveAction ||
    !isJsonNumber(sessionActions.queuedCount) ||
    !Number.isSafeInteger(sessionActions.queuedCount) ||
    sessionActions.queuedCount < 0 ||
    (value.taskState !== undefined &&
      value.taskState !== 'needs_input' &&
      value.taskState !== 'completed')
  ) {
    return null;
  }

  const hasConcreteWork =
    value.hasRunningRlmChildren === true ||
    (value.isSessionActive &&
      (value.isStreaming ||
        value.isCompacting ||
        value.isBashRunning === true ||
        activeAction !== undefined ||
        sessionActions.queuedCount === 0));
  if (hasConcreteWork) return 'working';
  if (sessionActions.queuedCount > 0) return 'queued';
  if (
    value.taskState === 'needs_input' &&
    nonEmptyString(value.summary) !== null
  ) {
    return 'needs_input';
  }
  return value.taskState === 'completed' ? 'settled' : 'idle';
}

function parseSavedSession(
  value: JsonValue | undefined,
): PrimeAgentSavedSession | null {
  if (!isJsonRecord(value)) return null;

  const path = nonEmptyString(value.path);
  const cwd = nonEmptyString(value.cwd);
  const modifiedAt = nonEmptyString(value.modified);
  const messageCount = value.messageCount;
  const taskState = value.taskState;
  if (
    path === null ||
    cwd === null ||
    modifiedAt === null ||
    !Number.isFinite(Date.parse(modifiedAt)) ||
    !isJsonNumber(messageCount) ||
    !Number.isSafeInteger(messageCount) ||
    messageCount < 0 ||
    (taskState !== undefined &&
      taskState !== 'needs_input' &&
      taskState !== 'completed')
  ) {
    return null;
  }

  return {
    activity:
      taskState === 'completed'
        ? 'settled'
        : taskState === 'needs_input'
          ? 'needs_input'
          : 'idle',
    path,
    cwd,
    modifiedAt,
    messageCount,
    name: savedSessionName(value),
  };
}

function parseSession(
  value: JsonValue | undefined,
  requireAttachedClient: boolean,
): PrimeAgentSession | null {
  if (!isJsonRecord(value)) return null;

  const activeSessionId = nonEmptyString(value.activeSessionId);
  const cwd = nonEmptyString(value.cwd);
  const activity = parseSessionActivity(value);
  const attachedClients = value.attachedClients;
  const remainsLiveWithoutClient =
    activity === 'working' ||
    activity === 'queued' ||
    activity === 'needs_input';
  if (
    activeSessionId === null ||
    cwd === null ||
    activity === null ||
    value.runtimeKind === 'subagent' ||
    !isJsonNumber(attachedClients) ||
    (requireAttachedClient && attachedClients < 1 && !remainsLiveWithoutClient)
  ) {
    return null;
  }

  const parsedModel = value.model === undefined ? null : parseModel(value.model);
  if (value.model !== undefined && parsedModel === null) return null;

  return {
    activeSessionId,
    activity,
    cwd,
    name: sessionName(value),
    model: parsedModel,
    modifiedAt: nonEmptyString(value.modified),
    sessionPath: nonEmptyString(value.sessionFile),
  };
}

function parseSessionDto(
  value: JsonValue | undefined,
): PrimeAgentSession | null {
  if (!isJsonRecord(value)) return null;

  const activeSessionId = nonEmptyString(value.activeSessionId);
  const activity = value.activity;
  const cwd = nonEmptyString(value.cwd);
  const name = nonEmptyString(value.name);
  if (
    activeSessionId === null ||
    (activity !== 'working' &&
      activity !== 'queued' &&
      activity !== 'needs_input' &&
      activity !== 'idle' &&
      activity !== 'settled') ||
    cwd === null ||
    name === null
  ) {
    return null;
  }

  const parsedModel = value.model === null ? null : parseModel(value.model);
  if (value.model !== null && parsedModel === null) return null;

  const modifiedAt =
    value.modifiedAt === null ? null : nonEmptyString(value.modifiedAt);
  if (value.modifiedAt !== null && modifiedAt === null) return null;
  const sessionPath =
    value.sessionPath === null ? null : nonEmptyString(value.sessionPath);
  if (value.sessionPath !== null && sessionPath === null) return null;

  return {
    activeSessionId,
    activity,
    cwd,
    name,
    model: parsedModel,
    modifiedAt,
    sessionPath,
  };
}

function parseSavedSessionDto(
  value: JsonValue | undefined,
): PrimeAgentSavedSession | null {
  if (!isJsonRecord(value)) return null;

  const path = nonEmptyString(value.path);
  const cwd = nonEmptyString(value.cwd);
  const name = nonEmptyString(value.name);
  const modifiedAt = nonEmptyString(value.modifiedAt);
  const messageCount = value.messageCount;
  const activity = value.activity;
  if (
    path === null ||
    cwd === null ||
    name === null ||
    modifiedAt === null ||
    !Number.isFinite(Date.parse(modifiedAt)) ||
    !isJsonNumber(messageCount) ||
    !Number.isSafeInteger(messageCount) ||
    messageCount < 0 ||
    (activity !== 'needs_input' &&
      activity !== 'idle' &&
      activity !== 'settled')
  ) {
    return null;
  }

  return { activity, path, cwd, name, modifiedAt, messageCount };
}

function parseSavedSessions(
  value: JsonValue | undefined,
): readonly PrimeAgentSavedSession[] | null {
  if (!Array.isArray(value)) return null;

  const sessions = value.map(parseSavedSessionDto);
  return sessions.some((session) => session === null)
    ? null
    : sessions.filter(
        (session): session is PrimeAgentSavedSession => session !== null,
      );
}

function parseModels(
  value: JsonValue | undefined,
): readonly PrimeAgentModel[] | null {
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
  value: JsonValue,
): PrimeAgentResult<readonly PrimeAgentSession[]> {
  if (!isJsonRecord(value) || !Array.isArray(value.sessions)) {
    return failure('protocol_error', 'Prime Agent returned an invalid session list.');
  }

  const sessions = value.sessions
    .map((session) => parseSession(session, true))
    .filter((session): session is PrimeAgentSession => session !== null)
    .sort((left, right) =>
      (right.modifiedAt ?? '').localeCompare(left.modifiedAt ?? ''),
    );

  return { ok: true, value: sessions };
}

/** Parse durable top-level sessions returned by the Prime Agent daemon. */
export function parseSavedSessionListData(
  value: JsonValue,
): PrimeAgentResult<readonly PrimeAgentSavedSession[]> {
  if (!isJsonRecord(value) || !Array.isArray(value.sessions)) {
    return failure(
      'protocol_error',
      'Prime Agent returned an invalid saved session list.',
    );
  }

  const sessions: PrimeAgentSavedSession[] = [];
  for (const candidate of value.sessions) {
    if (
      isJsonRecord(candidate) &&
      (candidate.parentSessionPath !== undefined ||
        (isJsonNumber(candidate.rlmDepth) && candidate.rlmDepth > 0))
    ) {
      continue;
    }

    const session = parseSavedSession(candidate);
    if (session === null) {
      return failure(
        'protocol_error',
        'Prime Agent returned invalid saved session data.',
      );
    }
    sessions.push(session);
  }

  return {
    ok: true,
    value: sessions.sort((left, right) =>
      right.modifiedAt.localeCompare(left.modifiedAt),
    ),
  };
}

/** Parse one newly created Prime Agent session. */
export function parseCreatedSessionData(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentSession> {
  const session = parseSession(value, false);
  return session === null
    ? failure('protocol_error', 'Prime Agent returned an invalid Agent session.')
    : { ok: true, value: session };
}

/** One trusted skill-file reference parsed from a Prime Agent resource snapshot. */
export interface PrimeAgentSkillResource {
  readonly description: string | null;
  readonly filePath: string;
  readonly name: string;
}

/** Parse the skill files available to one active Prime Agent session. */
export function parseSkillResourceCatalogData(
  value: JsonValue,
): PrimeAgentResult<readonly PrimeAgentSkillResource[]> {
  if (!isJsonRecord(value) || !Array.isArray(value.skills)) {
    return failure(
      'protocol_error',
      'Prime Agent returned an invalid skill catalog.',
    );
  }

  const skills: PrimeAgentSkillResource[] = [];
  for (const candidate of value.skills) {
    if (!isJsonRecord(candidate)) {
      return failure(
        'protocol_error',
        'Prime Agent returned invalid skill data.',
      );
    }

    const name = nonEmptyString(candidate.name);
    const filePath = nonEmptyString(candidate.filePath);
    const description =
      candidate.description === undefined
        ? null
        : nonEmptyString(candidate.description);
    if (
      name === null ||
      filePath === null ||
      /\s/u.test(name) ||
      (candidate.description !== undefined && description === null)
    ) {
      return failure(
        'protocol_error',
        'Prime Agent returned invalid skill data.',
      );
    }

    skills.push({ description, filePath, name });
  }

  return {
    ok: true,
    value: skills.sort((left, right) => left.name.localeCompare(right.name)),
  };
}

/** Parse the models that Prime Agent reports as usable by one live session. */
export function parseAvailableModelsData(
  value: JsonValue,
): PrimeAgentResult<readonly PrimeAgentModel[]> {
  if (!isJsonRecord(value)) {
    return failure('protocol_error', 'Prime Agent returned invalid model data.');
  }

  const models = parseModels(value.models);
  if (models === null) {
    return failure('protocol_error', 'Prime Agent returned invalid model data.');
  }

  return { ok: true, value: models };
}

/** Parse one model returned after a Prime Agent model change. */
export function parseModelData(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentModel> {
  const model = parseModel(value);
  return model === null
    ? failure('protocol_error', 'Prime Agent returned invalid model data.')
    : { ok: true, value: model };
}

/** Parse the active model and reasoning effort returned by Prime Agent. */
export function parseConfigurationData(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentConfiguration> {
  if (!isJsonRecord(value)) {
    return failure(
      'protocol_error',
      'Prime Agent returned invalid model configuration data.',
    );
  }
  const thinkingLevel = parseThinkingLevel(value.thinkingLevel);
  const availableThinkingLevels = parseThinkingLevels(
    value.availableThinkingLevels,
  );
  const model =
    availableThinkingLevels !== null && isJsonRecord(value.model)
      ? parseModel({
          ...value.model,
          thinkingLevels: [...availableThinkingLevels],
        })
      : null;
  if (
    model === null ||
    thinkingLevel === null ||
    availableThinkingLevels === null ||
    !availableThinkingLevels.includes(thinkingLevel)
  ) {
    return failure(
      'protocol_error',
      'Prime Agent returned invalid model configuration data.',
    );
  }
  return {
    ok: true,
    value: { availableThinkingLevels, model, thinkingLevel },
  };
}

/** Parse whether the renderer needs a draft or connected-session model catalog. */
export function parseModelCatalogScope(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentModelCatalogScope> {
  if (!isJsonRecord(value)) {
    return failure('invalid_request', 'The model catalog scope is invalid.');
  }
  if (value.kind === 'draft') return { ok: true, value: { kind: 'draft' } };
  if (value.kind !== 'session') {
    return failure('invalid_request', 'The model catalog scope is invalid.');
  }
  const activeSessionId = nonEmptyString(value.activeSessionId);
  return activeSessionId === null
    ? failure('invalid_request', 'The model catalog scope is invalid.')
    : { ok: true, value: { kind: 'session', activeSessionId } };
}

/** Parse a model selection received from the isolated renderer. */
export function parseModelSelection(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentModelSelection> {
  if (!isJsonRecord(value)) {
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

/** Parse a reasoning-effort selection received from the isolated renderer. */
export function parseThinkingLevelSelection(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentThinkingLevelSelection> {
  if (!isJsonRecord(value)) {
    return failure('invalid_request', 'The reasoning effort is invalid.');
  }
  const activeSessionId = nonEmptyString(value.activeSessionId);
  const thinkingLevel = parseThinkingLevel(value.thinkingLevel);
  return activeSessionId === null || thinkingLevel === null
    ? failure('invalid_request', 'The reasoning effort is invalid.')
    : { ok: true, value: { activeSessionId, thinkingLevel } };
}

/** Parse a session identifier received from the isolated renderer. */
export function parseActiveSessionId(
  value: JsonValue,
): PrimeAgentResult<string> {
  const activeSessionId = nonEmptyString(value);
  return activeSessionId === null
    ? failure('invalid_request', 'The active session identifier is invalid.')
    : { ok: true, value: activeSessionId };
}

/** Parse a bounded history request received from the isolated renderer. */
export function parseSessionHistoryRequest(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentSessionHistoryRequest> {
  if (!isJsonRecord(value)) {
    return failure('invalid_request', 'The session history request is invalid.');
  }
  const activeSessionId = nonEmptyString(value.activeSessionId);
  const before = value.before;
  if (
    activeSessionId === null ||
    !isJsonNumber(before) ||
    !Number.isSafeInteger(before) ||
    before < 1
  ) {
    return failure('invalid_request', 'The session history request is invalid.');
  }
  return { ok: true, value: { activeSessionId, before } };
}

/** Parse a saved session path received from the isolated renderer. */
export function parseSavedSessionPath(value: JsonValue): PrimeAgentResult<string> {
  const sessionPath = nonEmptyString(value);
  return sessionPath === null
    ? failure('invalid_request', 'The saved session path is invalid.')
    : { ok: true, value: sessionPath };
}

/** Parse a session rename received from the isolated renderer. */
export function parseSessionRename(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentSessionRename> {
  if (!isJsonRecord(value)) {
    return failure('invalid_request', 'The Agent rename is invalid.');
  }

  const name = nonEmptyString(value.name);
  const sessionPath =
    value.sessionPath === null ? null : nonEmptyString(value.sessionPath);
  if (
    name === null ||
    (value.sessionPath !== null && sessionPath === null)
  ) {
    return failure('invalid_request', 'The Agent rename is invalid.');
  }

  if (value.kind === 'saved' && sessionPath !== null) {
    return { ok: true, value: { kind: 'saved', sessionPath, name } };
  }

  const activeSessionId = nonEmptyString(value.activeSessionId);
  if (value.kind !== 'live' || activeSessionId === null) {
    return failure('invalid_request', 'The Agent rename is invalid.');
  }

  return {
    ok: true,
    value: { kind: 'live', activeSessionId, sessionPath, name },
  };
}

/** Parse RLM maximum-depth state returned by the Prime Agent daemon. */
export function parseRlmDepthData(
  value: JsonValue | undefined,
): PrimeAgentResult<PrimeAgentRlmDepth> {
  if (!isJsonRecord(value)) {
    return failure('protocol_error', 'Prime Agent returned invalid RLM depth data.');
  }

  const maxDepth = value.maxDepth;
  const source = value.source;
  if (
    !isJsonNumber(maxDepth) ||
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
  value: JsonValue,
): PrimeAgentResult<PrimeAgentRlmDepthSelection> {
  if (!isJsonRecord(value)) {
    return failure('invalid_request', 'The RLM depth selection is invalid.');
  }

  const activeSessionId = nonEmptyString(value.activeSessionId);
  const maxDepth = value.maxDepth;
  if (
    activeSessionId === null ||
    !isJsonNumber(maxDepth) ||
    !Number.isSafeInteger(maxDepth) ||
    maxDepth < 0
  ) {
    return failure('invalid_request', 'The RLM depth selection is invalid.');
  }

  return { ok: true, value: { activeSessionId, maxDepth } };
}

function parseResult<T>(
  value: JsonValue,
  parseValue: (input: JsonValue | undefined) => T | null,
): PrimeAgentResult<T> {
  if (!isJsonRecord(value) || !isJsonBoolean(value.ok)) {
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

function parseWorkspace(
  value: JsonValue | undefined,
): PrimeAgentWorkspace | null {
  if (!isJsonRecord(value)) return null;
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

function parseGitBranches(
  value: JsonValue | undefined,
): PrimeAgentGitBranches | null {
  if (!isJsonRecord(value)) return null;

  const cwd = nonEmptyString(value.cwd);
  const current = value.current === null ? null : nonEmptyString(value.current);
  if (
    cwd === null ||
    (value.current !== null && current === null) ||
    !Array.isArray(value.names)
  ) {
    return null;
  }

  const names = value.names.map(nonEmptyString);
  if (names.some((name) => name === null)) return null;

  const parsedNames = names.filter((name): name is string => name !== null);
  if (
    new Set(parsedNames).size !== parsedNames.length ||
    (current !== null && !parsedNames.includes(current))
  ) {
    return null;
  }

  return {
    cwd,
    current,
    names: parsedNames,
  };
}

function parseGitWorktree(
  value: JsonValue | undefined,
): PrimeAgentGitWorktree | null {
  if (!isJsonRecord(value)) return null;

  const cwd = nonEmptyString(value.cwd);
  const branchName = nonEmptyString(value.branchName);
  return cwd === null || branchName === null ? null : { cwd, branchName };
}

function parseGitWorkspace(
  value: JsonValue | undefined,
): PrimeAgentGitWorkspace | null {
  if (!isJsonRecord(value)) return null;

  const cwd = nonEmptyString(value.cwd);
  const repositoryCwd = nonEmptyString(value.repositoryCwd);
  const branchName =
    value.branchName === null ? null : nonEmptyString(value.branchName);
  if (
    cwd === null ||
    repositoryCwd === null ||
    (value.branchName !== null && branchName === null)
  ) {
    return null;
  }
  return { cwd, repositoryCwd, branchName };
}

function parseTaskReceipt(
  value: JsonValue | undefined,
): PrimeAgentTaskReceipt | null {
  return isJsonRecord(value) && value.accepted === true ? { accepted: true } : null;
}

function parseRefinementReceipt(
  value: JsonValue | undefined,
): PrimeAgentRefinementReceipt | null {
  return isJsonRecord(value) && value.refined === true ? { refined: true } : null;
}

function parseSessionRenameReceipt(
  value: JsonValue | undefined,
): PrimeAgentSessionRenameReceipt | null {
  if (!isJsonRecord(value)) return null;
  const name = nonEmptyString(value.name);
  return name === null ? null : { name };
}

function parseSessionResultValue(
  value: JsonValue | undefined,
): PrimeAgentSession | null {
  return parseSessionDto(value);
}

function parseSkill(value: JsonValue | undefined): PrimeAgentSkill | null {
  if (!isJsonRecord(value)) return null;

  const command = nonEmptyString(value.command);
  const content = isJsonString(value.content) ? value.content : null;
  const name = nonEmptyString(value.name);
  const description =
    value.description === null ? null : nonEmptyString(value.description);
  if (
    command === null ||
    content === null ||
    name === null ||
    !command.startsWith('/skill:') ||
    command.slice('/skill:'.length) !== name ||
    (value.description !== null && description === null)
  ) {
    return null;
  }

  return { command, content, description, name };
}

function parseSkills(
  value: JsonValue | undefined,
): readonly PrimeAgentSkill[] | null {
  if (!Array.isArray(value)) return null;

  const skills: PrimeAgentSkill[] = [];
  for (const candidate of value) {
    const skill = parseSkill(candidate);
    if (skill === null) return null;
    skills.push(skill);
  }
  return skills;
}

/** Parse a workspace path received from the isolated renderer. */
export function parseWorkspaceCwd(value: JsonValue): PrimeAgentResult<string> {
  const cwd = nonEmptyString(value);
  return cwd === null
    ? failure('invalid_request', 'The workspace path is invalid.')
    : { ok: true, value: cwd };
}

/** Parse new-session configuration from the isolated renderer. */
export function parseSessionCreation(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentSessionCreation> {
  if (!isJsonRecord(value)) {
    return failure(
      'invalid_request',
      'The Agent session configuration is invalid.',
    );
  }

  const cwd = nonEmptyString(value.cwd);
  const rlmMaxDepth = value.rlmMaxDepth;
  if (
    cwd === null ||
    !isJsonNumber(rlmMaxDepth) ||
    !Number.isSafeInteger(rlmMaxDepth) ||
    rlmMaxDepth < 0
  ) {
    return failure(
      'invalid_request',
      'The Agent session configuration is invalid.',
    );
  }

  return { ok: true, value: { cwd, rlmMaxDepth } };
}

/** Parse a workspace result after it crosses the Electron IPC boundary. */
export function parseWorkspaceResult(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentWorkspace> {
  return parseResult(value, parseWorkspace);
}

/** Parse a newly created Agent session after it crosses the Electron IPC boundary. */
export function parseSessionResult(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentSession> {
  return parseResult(value, parseSessionResultValue);
}

/** Parse a focused chat snapshot after it crosses the Electron IPC boundary. */
export function parseSessionViewResult(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentSessionView> {
  return parseResult(value, parseSessionViewDto);
}

function parseSessionHistoryPage(
  value: JsonValue | undefined,
): PrimeAgentSessionHistoryPage | null {
  if (!isJsonRecord(value) || !Array.isArray(value.transcript)) return null;
  const activeSessionId = nonEmptyString(value.activeSessionId);
  const start = value.start;
  if (
    activeSessionId === null ||
    !isJsonNumber(start) ||
    !Number.isSafeInteger(start) ||
    start < 0
  ) {
    return null;
  }
  const parsedView = parseSessionViewDto({
    activeSessionId,
    historyStart: start,
    isStreaming: false,
    messages: [],
    rlmMaxDepth: 0,
    sessionName: null,
    spawnedSessions: [],
    transcript: value.transcript,
  });
  return parsedView === null
    ? null
    : { activeSessionId, start, transcript: parsedView.transcript };
}

/** Parse an earlier-history page after it crosses the Electron IPC boundary. */
export function parseSessionHistoryPageResult(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentSessionHistoryPage> {
  return parseResult(value, parseSessionHistoryPage);
}

/** Parse saved sessions after they cross the Electron IPC boundary. */
export function parseSavedSessionsResult(
  value: JsonValue,
): PrimeAgentResult<readonly PrimeAgentSavedSession[]> {
  return parseResult(value, parseSavedSessions);
}

/** Parse an Agent skill catalog after it crosses the Electron IPC boundary. */
export function parseSkillsResult(
  value: JsonValue,
): PrimeAgentResult<readonly PrimeAgentSkill[]> {
  return parseResult(value, parseSkills);
}

/** Parse local Git branches after they cross the Electron IPC boundary. */
export function parseGitBranchesResult(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentGitBranches> {
  return parseResult(value, parseGitBranches);
}

/** Parse a created Git worktree after it crosses the Electron IPC boundary. */
export function parseGitWorktreeResult(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentGitWorktree> {
  return parseResult(value, parseGitWorktree);
}

/** Parse Git repository identity after it crosses the Electron IPC boundary. */
export function parseGitWorkspaceResult(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentGitWorkspace> {
  return parseResult(value, parseGitWorkspace);
}

/** Parse a local Git branch change from the isolated renderer. */
export function parseGitBranchSelection(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentGitBranchSelection> {
  if (!isJsonRecord(value)) {
    return failure('invalid_request', 'The Git branch selection is invalid.');
  }

  const cwd = nonEmptyString(value.cwd);
  const name = nonEmptyString(value.name);
  return cwd === null || name === null
    ? failure('invalid_request', 'The Git branch selection is invalid.')
    : { ok: true, value: { cwd, name } };
}

/** Parse a local Git branch rename from the isolated renderer. */
export function parseGitBranchRename(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentGitBranchRename> {
  if (!isJsonRecord(value)) {
    return failure('invalid_request', 'The Git branch rename is invalid.');
  }

  const cwd = nonEmptyString(value.cwd);
  const currentName = nonEmptyString(value.currentName);
  const newName = nonEmptyString(value.newName);
  return cwd === null || currentName === null || newName === null
    ? failure('invalid_request', 'The Git branch rename is invalid.')
    : { ok: true, value: { cwd, currentName, newName } };
}

/** Parse a Git worktree creation request from the isolated renderer. */
export function parseGitWorktreeCreation(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentGitWorktreeCreation> {
  if (!isJsonRecord(value)) {
    return failure('invalid_request', 'The Git worktree request is invalid.');
  }

  const cwd = nonEmptyString(value.cwd);
  const branchName = nonEmptyString(value.branchName);
  return cwd === null || branchName === null
    ? failure('invalid_request', 'The Git worktree request is invalid.')
    : { ok: true, value: { cwd, branchName } };
}

/** Parse a task submission received from the isolated renderer. */
export function parseTaskSubmission(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentTaskSubmission> {
  if (!isJsonRecord(value)) {
    return failure('invalid_request', 'The task submission is invalid.');
  }

  const activeSessionId = nonEmptyString(value.activeSessionId);
  const message = nonEmptyString(value.message);
  return activeSessionId === null || message === null
    ? failure('invalid_request', 'The task submission is invalid.')
    : { ok: true, value: { activeSessionId, message } };
}

/** Parse a continual-harness refinement from the isolated renderer. */
export function parseRefinementRequest(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentRefinementRequest> {
  if (!isJsonRecord(value)) {
    return failure('invalid_request', 'The refinement request is invalid.');
  }

  const activeSessionId = nonEmptyString(value.activeSessionId);
  const instructions =
    value.instructions === null ? null : nonEmptyString(value.instructions);
  if (
    activeSessionId === null ||
    (value.instructions !== null && instructions === null)
  ) {
    return failure('invalid_request', 'The refinement request is invalid.');
  }

  return { ok: true, value: { activeSessionId, instructions } };
}

/** Parse a task receipt after it crosses the Electron IPC boundary. */
export function parseTaskReceiptResult(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentTaskReceipt> {
  return parseResult(value, parseTaskReceipt);
}

/** Parse a refinement receipt after it crosses the Electron IPC boundary. */
export function parseRefinementReceiptResult(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentRefinementReceipt> {
  return parseResult(value, parseRefinementReceipt);
}

/** Parse a session-rename receipt after it crosses Electron IPC. */
export function parseSessionRenameResult(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentSessionRenameReceipt> {
  return parseResult(value, parseSessionRenameReceipt);
}

/** Parse a model-list result after it crosses the Electron IPC boundary. */
export function parseModelsResult(
  value: JsonValue,
): PrimeAgentResult<readonly PrimeAgentModel[]> {
  return parseResult(value, parseModels);
}

/** Parse a model-change result after it crosses the Electron IPC boundary. */
export function parseModelResult(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentModel> {
  return parseResult(value, parseModel);
}

function parseConfiguration(
  value: JsonValue | undefined,
): PrimeAgentConfiguration | null {
  const result = parseConfigurationData(value ?? null);
  return result.ok ? result.value : null;
}

/** Parse model configuration after it crosses the Electron IPC boundary. */
export function parseConfigurationResult(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentConfiguration> {
  return parseResult(value, parseConfiguration);
}

function parseRlmDepth(
  value: JsonValue | undefined,
): PrimeAgentRlmDepth | null {
  const result = parseRlmDepthData(value);
  return result.ok ? result.value : null;
}

/** Parse an RLM-depth result after it crosses the Electron IPC boundary. */
export function parseRlmDepthResult(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentRlmDepth> {
  return parseResult(value, parseRlmDepth);
}
