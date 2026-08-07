import { useId } from "react";
import type { ThreadItem } from "./transcript";

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

/** Renders one renderer-owned IPython execution record as an accessible transcript card. */
export function IPythonExecutionCard({ execution }: { readonly execution: IPythonExecutionItem }) {
  const titleId = useId();
  const metadataId = useId();
  const startedAt = execution.startedAt === null ? null : new Date(execution.startedAt);
  const statusLabel = STATUS_LABELS[execution.status];

  return <section
    className={`ipython-execution-card ${execution.status}`}
    aria-labelledby={titleId}
    aria-describedby={metadataId}
  >
    <header className="ipython-execution-heading">
      <h3 id={titleId}>IPython execution</h3>
      <span className="ipython-execution-target">{execution.executionTarget === "local" ? "Local" : execution.executionTarget === "modal" ? "Remote (legacy)" : "Runtime unavailable"}</span>
      <span className="ipython-execution-status" aria-label={`Status: ${statusLabel}`}>{statusLabel}</span>
    </header>
    <p id={metadataId} className="ipython-execution-meta">
      {startedAt && <time dateTime={startedAt.toISOString()}>Started {startedAt.toLocaleTimeString()}</time>}
      {execution.durationMs !== null && <span>Duration {formatDuration(execution.durationMs)}</span>}
    </p>
    <section className="ipython-execution-code" aria-label="Executed code">
      <pre tabIndex={0}><code>{execution.code}</code></pre>
    </section>
    {execution.detail && <section className="ipython-execution-detail" aria-label="Execution output">
      <pre tabIndex={0}>{execution.detail}</pre>
    </section>}
  </section>;
}
