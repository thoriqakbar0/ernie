import { Effect } from 'effect';
import { useRef, useState } from 'react';

import type { CreateAgentWithTaskResult } from '@/hooks/use-prime-agent-workspace';
import { parsePrimeAgentTaskReceiptResult } from '@/packages/prime-agent-daemon/client';

/** State and actions owned by Ernie's focused task composer. */
export interface PrimeAgentTaskController {
  readonly canSubmit: boolean;
  readonly draft: string;
  readonly status: string;
  readonly submitting: boolean;
  readonly changeDraft: (message: string) => void;
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
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submissionInFlight = useRef(false);

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

  return {
    canSubmit:
      (activeSessionId !== null || selectedCwd !== null) &&
      draft.trim().length > 0,
    draft,
    status,
    submitting,
    changeDraft: setDraft,
    submit,
  };
}
