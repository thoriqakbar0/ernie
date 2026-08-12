import type { JsonValue } from '../json-value/index.js';
import {
  isJsonNumber,
  isJsonRecord,
  isJsonString,
} from '../json-value/index.js';
import { parseSessionViewResult } from './lib/protocol.js';
import type {
  PrimeAgentFailure,
  PrimeAgentResult,
  PrimeAgentSessionFeedEnvelope,
  PrimeAgentSessionFeedItem,
  PrimeAgentSessionFeedRequest,
  PrimeAgentSessionView,
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

function parseFailure(value: JsonValue): PrimeAgentFailure | null {
  if (!isJsonRecord(value) || !isJsonString(value.message)) return null;
  const code = value.code;
  if (
    code !== 'invalid_request' &&
    code !== 'daemon_unavailable' &&
    code !== 'request_failed' &&
    code !== 'protocol_error'
  ) {
    return null;
  }
  const message = value.message.trim();
  return message.length === 0 ? null : { code, message };
}

function parseView(value: JsonValue): PrimeAgentSessionView | null {
  const result = parseSessionViewResult({ ok: true, value });
  return result.ok ? result.value : null;
}

function parseFeedItem(value: JsonValue): PrimeAgentSessionFeedItem | null {
  if (!isJsonRecord(value)) return null;

  if (value.kind === 'snapshot') {
    const view = parseView(value.view);
    return view === null ? null : { kind: 'snapshot', view };
  }

  if (value.kind === 'conversation-replaced') {
    const view = parseView({
      activeSessionId: 'feed-validation',
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

  if (value.kind === 'spawned-sessions-replaced') {
    const view = parseView({
      activeSessionId: 'feed-validation',
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
    { kind: 'conversation-replaced' }
  > | null = null;
  for (const item of items) {
    if (item.kind === 'conversation-replaced') {
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
        isStreaming: item.isStreaming,
        messages: item.messages,
        transcript: item.transcript,
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
