import { Stream } from 'effect';

import type {
  AgentSessionFeedItem,
  AgentSessionHistoryPage,
  AgentSessionView,
  AgentTranscriptItem,
} from '../client.js';

const sessionTranscriptWindowItems = 80;

interface ConversationWindow {
  readonly start: number;
  readonly transcript: readonly AgentTranscriptItem[];
}

function sameStringArray(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function sameTranscriptItem(
  left: AgentTranscriptItem,
  right: AgentTranscriptItem,
): boolean {
  if (left.id !== right.id || left.kind !== right.kind) return false;
  if (left.kind === 'message' && right.kind === 'message') {
    return left.role === right.role && left.text === right.text;
  }
  if (left.kind !== 'ipython' || right.kind !== 'ipython') return false;
  return left.code === right.code &&
    left.durationMs === right.durationMs &&
    left.result === right.result &&
    left.status === right.status &&
    left.stderr === right.stderr &&
    left.stdout === right.stdout &&
    sameStringArray(left.traceback, right.traceback) &&
    left.attachments.length === right.attachments.length &&
    left.attachments.every((attachment, index) => {
      const candidate = right.attachments[index];
      return candidate !== undefined &&
        attachment.data === candidate.data &&
        attachment.mimeType === candidate.mimeType &&
        attachment.path === candidate.path;
    });
}

function boundedConversation(
  historyStart: number,
  transcript: readonly AgentTranscriptItem[],
): ConversationWindow {
  const omitted = Math.max(0, transcript.length - sessionTranscriptWindowItems);
  return {
    start: historyStart + omitted,
    transcript: transcript.slice(omitted),
  };
}

function patchStart(
  previous: ConversationWindow,
  next: ConversationWindow,
): number {
  const previousEnd = previous.start + previous.transcript.length;
  const nextEnd = next.start + next.transcript.length;
  if (next.start < previous.start || next.start > previousEnd) return next.start;

  const overlapEnd = Math.min(previousEnd, nextEnd);
  for (let index = next.start; index < overlapEnd; index += 1) {
    const previousItem = previous.transcript[index - previous.start];
    const nextItem = next.transcript[index - next.start];
    if (
      previousItem === undefined ||
      nextItem === undefined ||
      !sameTranscriptItem(previousItem, nextItem)
    ) {
      return index;
    }
  }
  return overlapEnd;
}

function applyPatch(
  previous: ConversationWindow | null,
  item: Extract<AgentSessionFeedItem, { kind: 'conversation-patched' }>,
): ConversationWindow {
  const historyStart = previous?.start === item.previousHistoryStart
    ? item.historyStart
    : previous?.start ?? item.historyStart;
  const transcript = previous === null
    ? []
    : previous.transcript.slice(Math.max(0, historyStart - previous.start));
  if (
    previous === null ||
    item.from < historyStart ||
    item.from > historyStart + transcript.length
  ) {
    return { start: item.from, transcript: item.transcript };
  }
  return boundedConversation(historyStart, [
    ...transcript.slice(0, item.from - historyStart),
    ...item.transcript,
  ]);
}

/** Limit one complete view to the newest bounded transcript window. */
export function windowAgentSessionView(
  view: AgentSessionView,
): AgentSessionView {
  const conversation = boundedConversation(view.historyStart, view.transcript);
  return {
    ...view,
    historyStart: conversation.start,
    messages: view.messages.slice(-sessionTranscriptWindowItems),
    transcript: conversation.transcript,
  };
}

/** Turn full conversation replacements into bounded suffix patches. */
export function windowAgentSessionFeed(
  source: Stream.Stream<AgentSessionFeedItem>,
): Stream.Stream<AgentSessionFeedItem> {
  return source.pipe(
    Stream.mapAccum(
      (): ConversationWindow | null => null,
      (
        previous,
        item,
      ): readonly [
        ConversationWindow | null,
        readonly AgentSessionFeedItem[],
      ] => {
        if (item.kind === 'snapshot') {
          const view = windowAgentSessionView(item.view);
          return [
            { start: view.historyStart, transcript: view.transcript },
            [{ kind: 'snapshot', view }],
          ];
        }
        if (item.kind === 'conversation-replaced') {
          const next = boundedConversation(0, item.transcript);
          const from = previous === null ? next.start : patchStart(previous, next);
          return [
            next,
            [{
              from,
              historyStart: next.start,
              kind: 'conversation-patched',
              isStreaming: item.isStreaming,
              messages: item.messages.slice(-sessionTranscriptWindowItems),
              previousHistoryStart: previous?.start ?? next.start,
              transcript: next.transcript.slice(from - next.start),
            }],
          ];
        }
        if (item.kind === 'conversation-patched') {
          return [applyPatch(previous, item), [item]];
        }
        return [previous, [item]];
      },
    ),
  );
}

/** Read one fixed-size page immediately before the requested transcript index. */
export function agentSessionHistoryPage(
  view: AgentSessionView,
  before: number,
): AgentSessionHistoryPage {
  const end = Math.min(
    Math.max(before, view.historyStart),
    view.historyStart + view.transcript.length,
  );
  const start = Math.max(view.historyStart, end - sessionTranscriptWindowItems);
  return {
    activeSessionId: view.activeSessionId,
    start,
    transcript: view.transcript.slice(
      start - view.historyStart,
      end - view.historyStart,
    ),
  };
}
