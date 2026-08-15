import type {
  AgentSessionFeedItem,
  AgentSessionView,
} from '../client.js';

const defaultMaximumEntries = 24;
const defaultMaximumCacheableTranscriptItems = 200;

/** Capacity controls for the bounded Agent session-view cache. */
export interface AgentSessionViewCacheOptions {
  readonly maximumCacheableTranscriptItems?: number;
  readonly maximumEntries?: number;
}

/** Bounded stale-while-refresh storage for normalized Agent session views. */
export interface AgentSessionViewCache {
  /** Apply one normalized feed item to its cached session projection. */
  readonly apply: (
    activeSessionId: string,
    item: AgentSessionFeedItem,
  ) => void;
  /** Remove every retained session view. */
  readonly clear: () => void;
  /** Read and mark one session view as recently used. */
  readonly read: (activeSessionId: string) => AgentSessionView | null;
  /** Read one session view without changing cache order. */
  readonly peek: (activeSessionId: string) => AgentSessionView | null;
  /** Store one complete normalized session view. */
  readonly put: (view: AgentSessionView) => void;
  /** Number of currently retained session views. */
  readonly size: number;
}

function mergeSnapshotHistory(
  current: AgentSessionView | null,
  incoming: AgentSessionView,
  previousHistoryStart: number | null,
): AgentSessionView {
  if (current === null || previousHistoryStart === null) {
    return incoming;
  }
  const currentEnd = current.historyStart + current.transcript.length;
  if (
    current.historyStart >= previousHistoryStart ||
    previousHistoryStart > currentEnd ||
    incoming.historyStart < current.historyStart ||
    incoming.historyStart > currentEnd
  ) {
    return incoming;
  }
  return {
    ...incoming,
    historyStart: current.historyStart,
    transcript: [
      ...current.transcript.slice(
        0,
        incoming.historyStart - current.historyStart,
      ),
      ...incoming.transcript,
    ],
  };
}

function updatedView(
  current: AgentSessionView | null,
  activeSessionId: string,
  item: AgentSessionFeedItem,
): AgentSessionView | null {
  if (item.kind === 'snapshot') {
    if (item.view.activeSessionId !== activeSessionId) {
      throw new Error('An Agent session snapshot must match its cache key.');
    }
    return mergeSnapshotHistory(
      current,
      item.view,
      item.previousHistoryStart,
    );
  }
  if (
    item.kind === 'closed' ||
    item.kind === 'connection-changed' ||
    current === null
  ) {
    return current;
  }
  if (item.kind === 'conversation-replaced') {
    return {
      ...current,
      historyStart: 0,
      isStreaming: item.isStreaming,
      messages: item.messages,
      transcript: item.transcript,
    };
  }
  if (item.kind === 'conversation-patched') {
    const preservesLoadedHistory = current.historyStart <
      item.previousHistoryStart;
    const historyStart = preservesLoadedHistory
      ? current.historyStart
      : item.historyStart;
    const transcript = preservesLoadedHistory
      ? current.transcript
      : current.transcript.slice(
          Math.max(0, item.historyStart - current.historyStart),
        );
    const messages = item.messagesFrom <= current.messages.length
      ? [...current.messages.slice(0, item.messagesFrom), ...item.messages]
      : item.messages;
    if (
      item.from < historyStart ||
      item.from > historyStart + transcript.length
    ) {
      return {
        ...current,
        historyStart: item.from,
        isStreaming: item.isStreaming,
        messages,
        transcript: item.transcript,
      };
    }
    return {
      ...current,
      historyStart,
      isStreaming: item.isStreaming,
      messages,
      transcript: [
        ...transcript.slice(0, item.from - historyStart),
        ...item.transcript,
      ],
    };
  }
  if (item.kind === 'spawned-sessions-replaced') {
    return { ...current, spawnedSessions: item.sessions };
  }
  if (item.kind === 'session-name-changed') {
    return { ...current, sessionName: item.sessionName };
  }
  const exhaustiveItem: never = item;
  return exhaustiveItem;
}

/** Create a bounded cache that keeps session switches warm while feeds refresh. */
export function createAgentSessionViewCache(
  options: AgentSessionViewCacheOptions = {},
): AgentSessionViewCache {
  const maximumEntries = options.maximumEntries ?? defaultMaximumEntries;
  const maximumCacheableTranscriptItems =
    options.maximumCacheableTranscriptItems ??
    defaultMaximumCacheableTranscriptItems;
  if (
    !Number.isSafeInteger(maximumEntries) ||
    maximumEntries < 1 ||
    !Number.isSafeInteger(maximumCacheableTranscriptItems) ||
    maximumCacheableTranscriptItems < 1
  ) {
    throw new Error('Agent session cache limits must be positive.');
  }
  const entries = new Map<string, AgentSessionView>();

  const put = (view: AgentSessionView): void => {
    const overflow = Math.max(
      0,
      view.transcript.length - maximumCacheableTranscriptItems,
    );
    const retained = overflow === 0
      ? view
      : {
          ...view,
          historyStart: view.historyStart + overflow,
          transcript: view.transcript.slice(overflow),
        };
    entries.delete(view.activeSessionId);
    entries.set(view.activeSessionId, retained);
    while (entries.size > maximumEntries) {
      const oldestSessionId = entries.keys().next().value;
      if (oldestSessionId === undefined) return;
      entries.delete(oldestSessionId);
    }
  };

  return {
    apply(activeSessionId, item) {
      const current = entries.get(activeSessionId) ?? null;
      const next = updatedView(current, activeSessionId, item);
      if (next !== null && next !== current) put(next);
    },
    clear: () => entries.clear(),
    read(activeSessionId) {
      const view = entries.get(activeSessionId);
      if (view === undefined) return null;
      put(view);
      return view;
    },
    peek: (activeSessionId) => entries.get(activeSessionId) ?? null,
    put,
    get size() {
      return entries.size;
    },
  };
}
