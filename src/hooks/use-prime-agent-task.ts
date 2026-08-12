import { Effect } from 'effect';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { CreateAgentWithTaskResult } from '@/hooks/use-prime-agent-workspace';
import {
  parsePrimeAgentRefinementReceiptResult,
  parsePrimeAgentTaskReceiptResult,
} from '@/packages/prime-agent-daemon/client';

const taskDraftStorageKey = 'ernie:task-drafts:v1';

function readDrafts(): Record<string, string> {
  try {
    const value: unknown = JSON.parse(
      window.localStorage.getItem(taskDraftStorageKey) ?? '{}',
    );
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
  } catch {
    return {};
  }
}

function writeDraft(key: string, draft: string): void {
  try {
    const drafts = readDrafts();
    if (draft.length === 0) delete drafts[key];
    else drafts[key] = draft;
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
  const [draft, setDraft] = useState(() => readDrafts()[draftKey] ?? '');
  const [status, setStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submissionInFlight = useRef(false);

  useEffect(() => writeDraft(draftKey, draft), [draft, draftKey]);

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
          writeDraft(draftKey, '');
          setDraft((currentDraft) =>
            currentDraft === submittedDraft ? '' : currentDraft,
          );
          setStatus('Task sent to Prime Agent.');
        });
        return;
      }

      const rawResult = yield* Effect.tryPromise(() =>
        window.ernie.submitPrimeAgentTask({
          activeSessionId: target.activeSessionId,
          message,
        }),
      );
      const result = parsePrimeAgentTaskReceiptResult(rawResult);
      if (!result.ok) {
        yield* Effect.sync(() => setStatus(result.error.message));
        return;
      }

      yield* Effect.sync(() => {
        writeDraft(draftKey, '');
        setDraft((currentDraft) =>
          currentDraft === submittedDraft ? '' : currentDraft,
        );
        setStatus('Task sent to Prime Agent.');
      });
    });

    Effect.runFork(
      submitTask().pipe(
        Effect.catchAll(() =>
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
      const rawResult = yield* Effect.tryPromise(() =>
        window.ernie.refinePrimeAgentSession({
          activeSessionId,
          instructions,
        }),
      );
      const result = parsePrimeAgentRefinementReceiptResult(rawResult);
      if (!result.ok) {
        yield* Effect.sync(() => setStatus(result.error.message));
        return;
      }

      yield* Effect.sync(() => {
        writeDraft(draftKey, '');
        setDraft((currentDraft) =>
          currentDraft === submittedDraft ? '' : currentDraft,
        );
        setStatus('Prime Agent refined this session.');
      });
    });

    Effect.runFork(
      refineSession().pipe(
        Effect.catchAll(() =>
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
    changeDraft: setDraft,
    refine,
    submit,
  };
}
