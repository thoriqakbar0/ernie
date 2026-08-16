import { Effect } from 'effect';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { CreateAgentWithTaskResult } from '@/packages/agent-workspace';
import type { PrimeAgentRendererClient } from '@/packages/agent-renderer-client';
import {
  isJsonRecord,
  isJsonString,
  parseJsonValue,
} from '@/packages/json-value';

const taskDraftStorageKey = 'ernie:task-drafts:v1';

function readDrafts(): Record<string, string> {
  try {
    const value = parseJsonValue(
      JSON.parse(window.localStorage.getItem(taskDraftStorageKey) ?? '{}'),
    );
    if (!isJsonRecord(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, string] => isJsonString(entry[1]),
      ),
    );
  } catch {
    return {};
  }
}

function writeDrafts(drafts: Readonly<Record<string, string>>): void {
  try {
    window.localStorage.setItem(taskDraftStorageKey, JSON.stringify(drafts));
  } catch {
    // The mounted composer still owns the draft when storage is unavailable.
  }
}

/** State and actions owned by Ernie's focused task composer. */
export interface PrimeAgentTaskController {
  readonly canSubmit: boolean;
  readonly draft: string;
  readonly status: string;
  readonly submitting: boolean;
  readonly changeDraft: (message: string) => void;
  readonly refine: () => void;
  readonly submit: () => void;
}

/** Submit task drafts without rerendering the surrounding workspace controls. */
export function usePrimeAgentTask(
  agent: PrimeAgentRendererClient,
  activeSessionId: string | null,
  selectedCwd: string | null,
  createAgentWithTask: (
    cwd: string,
    message: string,
  ) => Promise<CreateAgentWithTaskResult>,
): PrimeAgentTaskController {
  const draftKey = useMemo(
    () =>
      activeSessionId === null
        ? `space:${selectedCwd ?? 'none'}`
        : `agent:${activeSessionId}`,
    [activeSessionId, selectedCwd],
  );
  const [drafts, setDrafts] = useState(readDrafts);
  const [status, setStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submissionInFlight = useRef(false);
  const draft = drafts[draftKey] ?? '';

  useEffect(() => writeDrafts(drafts), [drafts]);

  const updateDraft = (key: string, message: string): void => {
    setDrafts((current) => {
      if ((current[key] ?? '') === message) return current;
      const next = { ...current };
      if (message.length === 0) delete next[key];
      else next[key] = message;
      return next;
    });
  };

  const clearSubmittedDraft = (key: string, submittedDraft: string): void => {
    setDrafts((current) => {
      if ((current[key] ?? '') !== submittedDraft) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  function submit(): void {
    const submittedDraft = draft;
    const message = submittedDraft.trim();
    if (message.length === 0 || submissionInFlight.current) {
      return;
    }
    const target =
      activeSessionId !== null
        ? { kind: 'connected' as const, activeSessionId }
        : selectedCwd !== null
          ? { kind: 'new' as const, cwd: selectedCwd }
          : null;
    if (target === null) return;

    submissionInFlight.current = true;
    setSubmitting(true);
    setStatus('Sending task to Prime Agent…');
    const submitTask = Effect.fn('Task.submit')(function* () {
      if (target.kind === 'new') {
        const result = yield* Effect.tryPromise(() =>
          createAgentWithTask(target.cwd, message),
        );
        if (!result.ok) {
          yield* Effect.sync(() => setStatus(result.message));
          return;
        }

        yield* Effect.sync(() => {
          clearSubmittedDraft(draftKey, submittedDraft);
          setStatus('Task sent to Prime Agent.');
        });
        return;
      }

      const result = yield* Effect.tryPromise(() =>
        agent.submitTask({
          activeSessionId: target.activeSessionId,
          message,
        }),
      );
      if (!result.ok) {
        yield* Effect.sync(() => setStatus(result.error.message));
        return;
      }

      yield* Effect.sync(() => {
        clearSubmittedDraft(draftKey, submittedDraft);
        setStatus('Task sent to Prime Agent.');
      });
    });

    Effect.runFork(
      submitTask().pipe(
        Effect.catch(() =>
          Effect.sync(() =>
            setStatus('Ernie could not send the task to Prime Agent.'),
          ),
        ),
        Effect.ensuring(
          Effect.sync(() => {
            submissionInFlight.current = false;
            setSubmitting(false);
          }),
        ),
      ),
    );
  }

  function refine(): void {
    if (activeSessionId === null || submissionInFlight.current) return;
    const submittedDraft = draft;
    const trimmedDraft = submittedDraft.trim();
    const instructions = trimmedDraft.length === 0 ? null : trimmedDraft;

    submissionInFlight.current = true;
    setSubmitting(true);
    setStatus('Refining this Prime Agent session…');
    const refineSession = Effect.fn('Task.refine')(function* () {
      const result = yield* Effect.tryPromise(() =>
        agent.refineSession({
          activeSessionId,
          instructions,
        }),
      );
      if (!result.ok) {
        yield* Effect.sync(() => setStatus(result.error.message));
        return;
      }

      yield* Effect.sync(() => {
        clearSubmittedDraft(draftKey, submittedDraft);
        setStatus('Prime Agent refined this session.');
      });
    });

    Effect.runFork(
      refineSession().pipe(
        Effect.catch(() =>
          Effect.sync(() =>
            setStatus('Ernie could not refine this Prime Agent session.'),
          ),
        ),
        Effect.ensuring(
          Effect.sync(() => {
            submissionInFlight.current = false;
            setSubmitting(false);
          }),
        ),
      ),
    );
  }

  return {
    canSubmit:
      (activeSessionId !== null || selectedCwd !== null) &&
      draft.trim().length > 0,
    draft,
    status,
    submitting,
    changeDraft: (message) => updateDraft(draftKey, message),
    refine,
    submit,
  };
}
