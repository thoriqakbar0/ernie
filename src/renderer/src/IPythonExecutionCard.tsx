import { useId } from "react";
import type { ThreadItem } from "./transcript";
import { ExecutionOutput } from "./ExecutionOutput";

type IPythonExecutionItem = Extract<ThreadItem, { readonly kind: "ipython_execution" }>;

const STATUS_LABELS: Readonly<Record<IPythonExecutionItem["status"], string>> = {
  running: "Running",
  succeeded: "Completed",
  failed: "Failed",
  aborted: "Aborted",
};

function formatDuration(durationMs: number): string {
  if (durationMs < 1_000) return `${Math.round(durationMs)} ms`;
  return `${(durationMs / 1_000).toFixed(durationMs < 10_000 ? 1 : 0)} s`;
}

/** Names the execution language without changing the exact source shown on disclosure. */
export function executionLanguage(code: string): "Bash" | "IPython" {
  return /^\s*%%bash(?:\s|$)/u.test(code) ? "Bash" : "IPython";
}

/** Renders execution output in the transcript flow with its source behind a disclosure. */
export function IPythonExecutionCard({ execution }: { readonly execution: IPythonExecutionItem }) {
  const titleId = useId();
  const metadataId = useId();
  const startedAt = execution.startedAt === null ? null : new Date(execution.startedAt);
  const statusLabel = STATUS_LABELS[execution.status];
  const language = executionLanguage(execution.code);
  const targetLabel = execution.executionTarget === "local"
    ? "Local"
    : execution.executionTarget === "modal" ? "Remote (legacy)" : null;
  const hasMetadata = targetLabel !== null || startedAt !== null || execution.durationMs !== null;

  return <section
    className={`ipython-execution-card ${execution.status}`}
    aria-labelledby={titleId}
    aria-describedby={hasMetadata ? metadataId : undefined}
  >
    <details className="ipython-execution-source">
      <summary>
        <span className="ipython-execution-heading-copy">
          <span id={titleId} className="ipython-execution-language">{language}</span>
          {hasMetadata && <span id={metadataId} className="ipython-execution-meta">
            {targetLabel && <span>{targetLabel}</span>}
            {startedAt && <time dateTime={startedAt.toISOString()}>{startedAt.toLocaleTimeString()}</time>}
            {execution.durationMs !== null && <span>{formatDuration(execution.durationMs)}</span>}
          </span>}
        </span>
        <span className="ipython-execution-status" aria-label={`Status: ${statusLabel}`}>{statusLabel}</span>
      </summary>
      <section className="ipython-execution-code" aria-label={`Executed ${language} input`}>
        <pre tabIndex={0}><code>{execution.code}</code></pre>
      </section>
    </details>
    {execution.detail
      ? <ExecutionOutput detail={execution.detail} language={language} />
      : execution.status === "running" && <p className="ipython-execution-pending" role="status">Waiting for output…</p>}
  </section>;
}
