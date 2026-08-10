import { Effect } from 'effect';
import { useRef, useState } from 'react';

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
): PrimeAgentTaskController {
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submissionInFlight = useRef(false);

  function submit(): void {
    const submittedDraft = draft;
    const message = submittedDraft.trim();
    if (
      activeSessionId === null ||
      message.length === 0 ||
      submissionInFlight.current
    ) {
      return;
    }

    submissionInFlight.current = true;
    setSubmitting(true);
    setStatus('Sending task to Prime Agent…');
    const sessionId = activeSessionId;
    const submitTask = Effect.fn('Task.submit')(function* () {
      const rawResult = yield* Effect.tryPromise(() =>
        window.ernie.submitPrimeAgentTask({
          activeSessionId: sessionId,
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
    canSubmit: activeSessionId !== null && draft.trim().length > 0,
    draft,
    status,
    submitting,
    changeDraft: setDraft,
    submit,
  };
}
