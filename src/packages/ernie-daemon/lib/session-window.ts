import { Stream } from 'effect';

import type {
  AgentChatMessage,
  AgentSessionFeedItem,
  AgentSessionHistoryPage,
  AgentSessionView,
  AgentTranscriptItem,
} from '../client.js';

const sessionTranscriptWindowItems = 80;

interface ConversationWindow {
  readonly messages: readonly AgentChatMessage[];
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
  messages: readonly AgentChatMessage[],
): ConversationWindow {
  const omitted = Math.max(0, transcript.length - sessionTranscriptWindowItems);
  return {
    messages: messages.slice(-sessionTranscriptWindowItems),
    start: historyStart + omitted,
    transcript: transcript.slice(omitted),
  };
}

function messagePatchStart(
  previous: readonly AgentChatMessage[],
  next: readonly AgentChatMessage[],
): number {
  const overlapEnd = Math.min(previous.length, next.length);
  for (let index = 0; index < overlapEnd; index += 1) {
    const previousMessage = previous[index];
    const nextMessage = next[index];
    if (
      previousMessage === undefined ||
      nextMessage === undefined ||
      previousMessage.id !== nextMessage.id ||
      previousMessage.role !== nextMessage.role ||
      previousMessage.text !== nextMessage.text
    ) {
      return index;
    }
  }
  return overlapEnd;
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
  const messages =
    previous === null || item.messagesFrom > previous.messages.length
      ? item.messages
      : [
          ...previous.messages.slice(0, item.messagesFrom),
          ...item.messages,
        ];
  if (
    previous === null ||
    item.from < historyStart ||
    item.from > historyStart + transcript.length
  ) {
    return boundedConversation(item.from, item.transcript, messages);
  }
  return boundedConversation(historyStart, [
    ...transcript.slice(0, item.from - historyStart),
    ...item.transcript,
  ], messages);
}

/** Limit one complete view to the newest bounded transcript window. */
export function windowAgentSessionView(
  view: AgentSessionView,
): AgentSessionView {
  const conversation = boundedConversation(
    view.historyStart,
    view.transcript,
    view.messages,
  );
  return {
    ...view,
    historyStart: conversation.start,
    messages: conversation.messages,
    transcript: conversation.transcript,
  };
}

/** Turn full conversation replacements into bounded suffix patches. */
export function windowAgentSessionFeed(
  source: Stream.Stream<AgentSessionFeedItem>,
  initialView: AgentSessionView | null = null,
): Stream.Stream<AgentSessionFeedItem> {
  return source.pipe(
    Stream.mapAccum(
      (): ConversationWindow | null => initialView === null
        ? null
        : boundedConversation(
            initialView.historyStart,
            initialView.transcript,
            initialView.messages,
          ),
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
            {
              messages: view.messages,
              start: view.historyStart,
              transcript: view.transcript,
            },
            [{
              kind: 'snapshot',
              previousHistoryStart: previous?.start ?? null,
              view,
            }],
          ];
        }
        if (item.kind === 'conversation-replaced') {
          const next = boundedConversation(0, item.transcript, item.messages);
          const from = previous === null ? next.start : patchStart(previous, next);
          const messagesFrom = previous === null
            ? 0
            : messagePatchStart(previous.messages, next.messages);
          return [
            next,
            [{
              from,
              historyStart: next.start,
              kind: 'conversation-patched',
              isStreaming: item.isStreaming,
              messages: next.messages.slice(messagesFrom),
              messagesFrom,
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
