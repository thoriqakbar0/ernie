import type { IPythonExecution } from "./contract";

/** A renderer-safe text block from a persisted transcript message. */
export interface SessionTranscriptTextBlock {
  readonly contentIndex: number;
  readonly text: string;
}

/** A renderer-safe persisted chat message. Non-text provider content is omitted. */
export interface SessionTranscriptMessage {
  readonly kind: "message";
  readonly messageId: string;
  readonly role: "user" | "assistant";
  readonly blocks: readonly SessionTranscriptTextBlock[];
}

/** The visible lifecycle of a tool call, without arguments, paths, or raw results. */
export interface SessionTranscriptTool {
  readonly kind: "tool";
  readonly callId: string;
  readonly name: string;
  readonly phase: "start" | "update" | "end";
  readonly status: "running" | "succeeded" | "failed" | "aborted";
  readonly detail: string;
  readonly ipython: boolean;
  readonly execution?: IPythonExecution;
}

/** A bounded, sanitized initial projection of one daemon session. */
export interface SessionTranscriptSnapshot {
  readonly kind: "snapshot";
  readonly activeSessionId: string;
  readonly items: readonly (SessionTranscriptMessage | SessionTranscriptTool)[];
  readonly historyTruncated: boolean;
}

/** Renderer-safe incremental transcript events for the selected session. */
export type SessionTranscriptEvent =
  | SessionTranscriptSnapshot
  | { readonly kind: "assistant_start"; readonly activeSessionId: string; readonly messageId: string }
  | { readonly kind: "assistant_delta"; readonly activeSessionId: string; readonly messageId: string; readonly contentIndex: number; readonly delta: string }
  | { readonly kind: "assistant_end"; readonly activeSessionId: string; readonly messageId: string; readonly blocks: readonly SessionTranscriptTextBlock[] }
  | { readonly kind: "user_message"; readonly activeSessionId: string; readonly message: SessionTranscriptMessage }
  | ({ readonly activeSessionId: string } & SessionTranscriptTool)
  | { readonly kind: "closed"; readonly activeSessionId: string };
