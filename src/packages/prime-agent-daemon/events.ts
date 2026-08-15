import type { JsonValue } from '../json-value/index.js';
import {
  isJsonNumber,
  isJsonRecord,
  isJsonString,
} from '../json-value/index.js';
import { parseSessionViewResult, parseWorkspaceResult } from './lib/protocol.js';
import type {
  PrimeAgentFailure,
  PrimeAgentResult,
  PrimeAgentSessionFeedEnvelope,
  PrimeAgentSessionFeedItem,
  PrimeAgentSessionFeedRequest,
  PrimeAgentSessionHistoryPage,
  PrimeAgentSessionView,
  PrimeAgentWorkspaceFeedItem,
} from './types.js';

/** Renderer-owned lifecycle state for one selected Prime Agent session feed. */
export type PrimeAgentSessionFeedState =
  | Readonly<{
      kind: 'connecting';
      activeSessionId: string;
      revision: number;
      subscriptionId: string;
    }>
  | Readonly<{
      kind: 'live' | 'reconnecting';
      activeSessionId: string;
      revision: number;
      subscriptionId: string;
      view: PrimeAgentSessionView;
    }>
  | Readonly<{
      kind: 'closed';
      activeSessionId: string;
      failure: PrimeAgentFailure;
      revision: number;
      subscriptionId: string;
      view: PrimeAgentSessionView | null;
    }>;

const invalidFeedMessage = 'Ernie received an invalid Prime Agent session event.';

function failure(): PrimeAgentResult<never> {
  return {
    ok: false,
    error: { code: 'protocol_error', message: invalidFeedMessage },
  };
}

function parseFailure(value: JsonValue | undefined): PrimeAgentFailure | null {
  if (!isJsonRecord(value) || !isJsonString(value.message)) return null;
  const code = value.code;
  if (
    code !== 'invalid_request' &&
    code !== 'daemon_unavailable' &&
    code !== 'request_failed' &&
    code !== 'outcome_uncertain' &&
    code !== 'unsupported_operation' &&
    code !== 'protocol_error'
  ) {
    return null;
  }
  const message = value.message.trim();
  return message.length === 0 ? null : { code, message };
}

function parseView(
  value: JsonValue | undefined,
): PrimeAgentSessionView | null {
  if (value === undefined) return null;
  const result = parseSessionViewResult({ ok: true, value });
  return result.ok ? result.value : null;
}

function parseFeedItem(
  value: JsonValue | undefined,
): PrimeAgentSessionFeedItem | null {
  if (!isJsonRecord(value)) return null;

  if (value.kind === 'snapshot') {
    const view = parseView(value.view);
    return view === null ? null : { kind: 'snapshot', view };
  }

  if (value.kind === 'conversation-replaced') {
    if (
      value.isStreaming === undefined ||
      value.messages === undefined ||
      value.transcript === undefined
    ) {
      return null;
    }
    const view = parseView({
      activeSessionId: 'feed-validation',
      historyStart: 0,
      isStreaming: value.isStreaming,
      messages: value.messages,
      rlmMaxDepth: 0,
      sessionName: null,
      spawnedSessions: [],
      transcript: value.transcript,
    });
    return view === null
      ? null
      : {
          kind: 'conversation-replaced',
          isStreaming: view.isStreaming,
          messages: view.messages,
          transcript: view.transcript,
        };
  }

  if (value.kind === 'conversation-patched') {
    if (
      value.from === undefined ||
      value.historyStart === undefined ||
      value.isStreaming === undefined ||
      value.messages === undefined ||
      value.previousHistoryStart === undefined ||
      value.transcript === undefined ||
      !isJsonNumber(value.from) ||
      !Number.isSafeInteger(value.from) ||
      value.from < 0 ||
      !isJsonNumber(value.historyStart) ||
      !Number.isSafeInteger(value.historyStart) ||
      value.historyStart < 0 ||
      value.historyStart > value.from ||
      !isJsonNumber(value.previousHistoryStart) ||
      !Number.isSafeInteger(value.previousHistoryStart) ||
      value.previousHistoryStart < 0
    ) {
      return null;
    }
    const view = parseView({
      activeSessionId: 'feed-validation',
      historyStart: value.from,
      isStreaming: value.isStreaming,
      messages: value.messages,
      rlmMaxDepth: 0,
      sessionName: null,
      spawnedSessions: [],
      transcript: value.transcript,
    });
    return view === null
      ? null
      : {
          from: value.from,
          historyStart: value.historyStart,
          kind: 'conversation-patched',
          isStreaming: view.isStreaming,
          messages: view.messages,
          previousHistoryStart: value.previousHistoryStart,
          transcript: view.transcript,
        };
  }

  if (value.kind === 'spawned-sessions-replaced') {
    if (value.sessions === undefined) return null;
    const view = parseView({
      activeSessionId: 'feed-validation',
      historyStart: 0,
      isStreaming: false,
      messages: [],
      rlmMaxDepth: 0,
      sessionName: null,
      spawnedSessions: value.sessions,
      transcript: [],
    });
    return view === null
      ? null
      : {
          kind: 'spawned-sessions-replaced',
          sessions: view.spawnedSessions,
        };
  }

  if (value.kind === 'session-name-changed') {
    if (value.sessionName === null) {
      return { kind: 'session-name-changed', sessionName: null };
    }
    if (!isJsonString(value.sessionName)) return null;
    const sessionName = value.sessionName.trim();
    return sessionName.length === 0
      ? null
      : { kind: 'session-name-changed', sessionName };
  }

  if (value.kind === 'connection-changed') {
    return value.status === 'live' || value.status === 'reconnecting'
      ? { kind: 'connection-changed', status: value.status }
      : null;
  }

  if (value.kind !== 'closed') return null;
  const parsedFailure = parseFailure(value.failure);
  return parsedFailure === null
    ? null
    : { kind: 'closed', failure: parsedFailure };
}

/** Parse one daemon-owned workspace event received through Electron IPC. */
export function parsePrimeAgentWorkspaceFeedItem(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentWorkspaceFeedItem> {
  if (!isJsonRecord(value)) return failure();
  if (value.kind === 'connection-changed') {
    const status = value.status;
    return status === 'connecting' ||
      status === 'ready' ||
      status === 'reconnecting' ||
      status === 'unavailable'
      ? { ok: true, value: { kind: 'connection-changed', status } }
      : failure();
  }
  if (value.kind !== 'workspace-replaced') {
    return failure();
  }
  if (value.workspace === undefined) return failure();
  const workspace = parseWorkspaceResult({ ok: true, value: value.workspace });
  return workspace.ok
    ? {
        ok: true,
        value: {
          kind: 'workspace-replaced',
          workspace: workspace.value,
        },
      }
    : failure();
}

/** Parse one serialized session-feed event received through Electron IPC. */
export function parsePrimeAgentSessionFeedEnvelope(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentSessionFeedEnvelope> {
  if (
    !isJsonRecord(value) ||
    !isJsonString(value.activeSessionId) ||
    !isJsonString(value.subscriptionId) ||
    !isJsonNumber(value.revision) ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0
  ) {
    return failure();
  }
  const activeSessionId = value.activeSessionId.trim();
  const subscriptionId = value.subscriptionId.trim();
  const item = parseFeedItem(value.item);
  if (activeSessionId.length === 0 || subscriptionId.length === 0 || item === null) {
    return failure();
  }
  return {
    ok: true,
    value: {
      activeSessionId,
      item,
      revision: value.revision,
      subscriptionId,
    },
  };
}

/** Parse one renderer request to start a selected session feed. */
export function parsePrimeAgentSessionFeedRequest(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentSessionFeedRequest> {
  if (
    !isJsonRecord(value) ||
    !isJsonString(value.activeSessionId) ||
    !isJsonString(value.subscriptionId)
  ) {
    return {
      ok: false,
      error: { code: 'invalid_request', message: 'Invalid session feed request.' },
    };
  }
  const activeSessionId = value.activeSessionId.trim();
  const subscriptionId = value.subscriptionId.trim();
  return activeSessionId.length === 0 || subscriptionId.length === 0
    ? {
        ok: false,
        error: { code: 'invalid_request', message: 'Invalid session feed request.' },
      }
    : { ok: true, value: { activeSessionId, subscriptionId } };
}

/** Parse one renderer request to stop a selected session feed. */
export function parsePrimeAgentSessionFeedStop(
  value: JsonValue,
): PrimeAgentResult<string> {
  if (!isJsonString(value) || value.trim().length === 0) {
    return {
      ok: false,
      error: { code: 'invalid_request', message: 'Invalid session feed request.' },
    };
  }
  return { ok: true, value: value.trim() };
}

/** Coalesce consecutive conversation frames while preserving event boundaries. */
export function coalescePrimeAgentSessionFeedItems(
  items: readonly PrimeAgentSessionFeedItem[],
): readonly PrimeAgentSessionFeedItem[] {
  const result: PrimeAgentSessionFeedItem[] = [];
  let pendingConversation: Extract<
    PrimeAgentSessionFeedItem,
    { kind: 'conversation-patched' | 'conversation-replaced' }
  > | null = null;
  for (const item of items) {
    if (item.kind === 'conversation-replaced') {
      if (pendingConversation?.kind === 'conversation-patched') {
        result.push(pendingConversation);
      }
      pendingConversation = item;
      continue;
    }
    if (item.kind === 'conversation-patched') {
      if (pendingConversation?.kind === 'conversation-patched') {
        const pendingEnd = pendingConversation.from +
          pendingConversation.transcript.length;
        if (item.from >= pendingConversation.from && item.from <= pendingEnd) {
          const prefixLength = item.from - pendingConversation.from;
          pendingConversation = {
            ...item,
            from: pendingConversation.from,
            previousHistoryStart: pendingConversation.previousHistoryStart,
            transcript: [
              ...pendingConversation.transcript.slice(0, prefixLength),
              ...item.transcript,
            ],
          };
          continue;
        }
        result.push(pendingConversation);
      } else if (pendingConversation !== null) {
        result.push(pendingConversation);
      }
      pendingConversation = item;
      continue;
    }
    if (pendingConversation !== null) {
      result.push(pendingConversation);
      pendingConversation = null;
    }
    result.push(item);
  }
  if (pendingConversation !== null) result.push(pendingConversation);
  return result;
}

/** Create the empty lifecycle state for one renderer-owned session feed. */
export function createPrimeAgentSessionFeedState(
  subscriptionId: string,
  activeSessionId: string,
): PrimeAgentSessionFeedState {
  return {
    kind: 'connecting',
    activeSessionId,
    revision: -1,
    subscriptionId,
  };
}

function stateView(state: PrimeAgentSessionFeedState): PrimeAgentSessionView | null {
  return state.kind === 'connecting' ? null : state.view;
}

function protocolClosedState(
  state: PrimeAgentSessionFeedState,
  revision: number,
): PrimeAgentSessionFeedState {
  return {
    kind: 'closed',
    activeSessionId: state.activeSessionId,
    failure: { code: 'protocol_error', message: invalidFeedMessage },
    revision,
    subscriptionId: state.subscriptionId,
    view: stateView(state),
  };
}

/** Apply one ordered session-feed event without allowing stale state mutation. */
export function reducePrimeAgentSessionFeed(
  state: PrimeAgentSessionFeedState,
  envelope: PrimeAgentSessionFeedEnvelope,
): PrimeAgentSessionFeedState {
  if (
    envelope.subscriptionId !== state.subscriptionId ||
    envelope.activeSessionId !== state.activeSessionId ||
    envelope.revision <= state.revision
  ) {
    return state;
  }
  if (state.kind === 'closed') return state;

  const item = envelope.item;
  if (item.kind === 'closed') {
    return {
      kind: 'closed',
      activeSessionId: state.activeSessionId,
      failure: item.failure,
      revision: envelope.revision,
      subscriptionId: state.subscriptionId,
      view: stateView(state),
    };
  }
  if (item.kind === 'snapshot') {
    if (item.view.activeSessionId !== state.activeSessionId) {
      return protocolClosedState(state, envelope.revision);
    }
    return {
      kind: 'live',
      activeSessionId: state.activeSessionId,
      revision: envelope.revision,
      subscriptionId: state.subscriptionId,
      view: item.view,
    };
  }
  if (item.kind === 'connection-changed') {
    const view = stateView(state);
    if (view === null) {
      return { ...state, revision: envelope.revision };
    }
    return {
      kind: item.status === 'live' ? 'live' : 'reconnecting',
      activeSessionId: state.activeSessionId,
      revision: envelope.revision,
      subscriptionId: state.subscriptionId,
      view,
    };
  }

  if (state.kind === 'connecting') {
    return protocolClosedState(state, envelope.revision);
  }
  const view = state.view;
  if (item.kind === 'conversation-replaced') {
    return {
      ...state,
      revision: envelope.revision,
      view: {
        ...view,
        historyStart: 0,
        isStreaming: item.isStreaming,
        messages: item.messages,
        transcript: item.transcript,
      },
    };
  }
  if (item.kind === 'conversation-patched') {
    const preservesLoadedHistory = view.historyStart < item.previousHistoryStart;
    const historyStart = preservesLoadedHistory
      ? view.historyStart
      : item.historyStart;
    const transcript = preservesLoadedHistory
      ? view.transcript
      : view.transcript.slice(
          Math.max(0, item.historyStart - view.historyStart),
        );
    const viewEnd = historyStart + transcript.length;
    const canPatch = item.from >= historyStart && item.from <= viewEnd;
    return {
      ...state,
      revision: envelope.revision,
      view: {
        ...view,
        historyStart: canPatch ? historyStart : item.from,
        isStreaming: item.isStreaming,
        messages: item.messages,
        transcript: canPatch
          ? [
              ...transcript.slice(0, item.from - historyStart),
              ...item.transcript,
            ]
          : item.transcript,
      },
    };
  }
  if (item.kind === 'spawned-sessions-replaced') {
    return {
      ...state,
      revision: envelope.revision,
      view: { ...view, spawnedSessions: item.sessions },
    };
  }
  return {
    ...state,
    revision: envelope.revision,
    view: { ...view, sessionName: item.sessionName },
  };
}

/** Read the last valid view retained by one session-feed lifecycle state. */
export function primeAgentSessionFeedView(
  state: PrimeAgentSessionFeedState,
): PrimeAgentSessionView | null {
  return stateView(state);
}

/** Prepend one contiguous earlier-history page to the current session view. */
export function prependPrimeAgentSessionHistory(
  state: PrimeAgentSessionFeedState,
  page: PrimeAgentSessionHistoryPage,
): PrimeAgentSessionFeedState {
  if (state.kind === 'connecting' || page.activeSessionId !== state.activeSessionId) {
    return state;
  }
  const view = state.view;
  if (
    view === null ||
    page.start + page.transcript.length !== view.historyStart
  ) {
    return state;
  }
  return {
    ...state,
    view: {
      ...view,
      historyStart: page.start,
      transcript: [...page.transcript, ...view.transcript],
    },
  };
}

/** Replace only the live RLM depth after a successful explicit command. */
export function replacePrimeAgentSessionFeedRlmDepth(
  state: PrimeAgentSessionFeedState,
  activeSessionId: string,
  rlmMaxDepth: number,
): PrimeAgentSessionFeedState {
  if (
    state.kind === 'connecting' ||
    state.activeSessionId !== activeSessionId
  ) {
    return state;
  }
  if (state.kind === 'closed') {
    return state.view === null
      ? state
      : { ...state, view: { ...state.view, rlmMaxDepth } };
  }
  return { ...state, view: { ...state.view, rlmMaxDepth } };
}
