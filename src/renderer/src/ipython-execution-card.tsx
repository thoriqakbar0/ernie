import { useEffect, useId, useRef, useState } from "react";
import type { ThreadItem } from "./transcript";
import { ExecutionOutput } from "./execution-output";
import { HighlightedCode } from "./highlighted-code";

type IPythonExecutionItem = Extract<ThreadItem, { readonly kind: "ipython_execution" }>;

const STATUS_LABELS: Readonly<Record<IPythonExecutionItem["status"], string>> = {
  running: "Running",
  succeeded: "Completed",
  failed: "Failed",
  aborted: "Aborted",
};


function ExecutionLanguageIcon({ language }: { readonly language: "Bash" | "IPython" }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true">{language === "Bash"
    ? <path d="M21.038 4.9 13.461.402a2.86 2.86 0 0 0-2.923.001L2.961 4.9A3.02 3.02 0 0 0 1.5 7.503v8.995c0 1.073.557 2.066 1.462 2.603l7.577 4.497a2.86 2.86 0 0 0 2.922 0l7.577-4.497a3.02 3.02 0 0 0 1.462-2.603V7.503A3.02 3.02 0 0 0 21.038 4.9M15.17 18.946l.013.646c.001.078-.05.167-.111.198l-.383.22c-.061.031-.111-.007-.112-.085l-.007-.635c-.328.136-.66.169-.872.084c-.04-.016-.057-.075-.041-.142l.139-.584a.24.24 0 0 1 .069-.121.2.2 0 0 1 .036-.026q.033-.017.062-.006c.229.077.521.041.802-.101c.357-.181.596-.545.592-.907-.003-.328-.181-.465-.613-.468-.55.001-1.064-.107-1.072-.917-.007-.667.34-1.361.889-1.8l-.007-.652c-.001-.08.048-.168.111-.2l.37-.236c.061-.031.111.007.112.087l.006.653c.273-.109.511-.138.726-.088c.047.012.067.076.048.151l-.144.578a.26.26 0 0 1-.065.116.2.2 0 0 1-.038.028.1.1 0 0 1-.057.009c-.098-.022-.332-.073-.699.113-.385.195-.52.53-.517.778.003.297.155.387.681.396.7.012 1.003.318 1.01 1.023.007.689-.362 1.433-.928 1.888m3.973-1.087c0 .06-.008.116-.058.145l-1.916 1.164c-.05.029-.09.004-.09-.056v-.494c0-.06.037-.093.087-.122l1.887-1.129c.05-.029.09-.004.09.056zm1.316-11.062-7.168 4.427c-.894.523-1.553 1.109-1.553 2.187v8.833c0 .645.26 1.063.66 1.184a2.3 2.3 0 0 1-.398.039c-.42 0-.833-.114-1.197-.33L3.226 18.64a2.5 2.5 0 0 1-1.201-2.142V7.503c0-.881.46-1.702 1.201-2.142L10.803.863a2.34 2.34 0 0 1 2.394 0l7.577 4.498a2.48 2.48 0 0 1 1.164 1.732c-.252-.536-.818-.682-1.479-.296" />
    : <path d="m14.25.18.9.2.73.26.59.3.45.32.34.34.25.34.16.33.1.3.04.26.02.2-.01.13V8.5l-.05.63-.13.55-.21.46-.26.38-.3.31-.33.25-.35.19-.35.14-.33.1-.3.07-.26.04-.21.02H8.77l-.69.05-.59.14-.5.22-.41.27-.33.32-.27.35-.2.36-.15.37-.1.35-.07.32-.04.27-.02.21v3.06H3.17l-.21-.03-.28-.07-.32-.12-.35-.18-.36-.26-.36-.36-.35-.46-.32-.59-.28-.73-.21-.88-.14-1.05-.05-1.23.06-1.22.16-1.04.24-.87.32-.71.36-.57.4-.44.42-.33.42-.24.4-.16.36-.1.32-.05.24-.01h.16l.06.01h8.16v-.83H6.18l-.01-2.75-.02-.37.05-.34.11-.31.17-.28.25-.26.31-.23.38-.2.44-.18.51-.15.58-.12.64-.1.71-.06.77-.04.84-.02 1.27.05zm-6.3 1.98-.23.33-.08.41.08.41.23.34.33.22.41.09.41-.09.33-.22.23-.34.08-.41-.08-.41-.23-.33-.33-.22-.41-.09-.41.09zm13.09 3.95.28.06.32.12.35.18.36.27.36.35.35.47.32.59.28.73.21.88.14 1.04.05 1.23-.06 1.23-.16 1.04-.24.86-.32.71-.36.57-.4.45-.42.33-.42.24-.4.16-.36.09-.32.05-.24.02-.16-.01h-8.22v.82h5.84l.01 2.76.02.36-.05.34-.11.31-.17.29-.25.25-.31.24-.38.2-.44.17-.51.15-.58.13-.64.09-.71.07-.77.04-.84.01-1.27-.04-1.07-.14-.9-.2-.73-.25-.59-.3-.45-.33-.34-.34-.25-.34-.16-.33-.1-.3-.04-.25-.02-.2.01-.13v-5.34l.05-.64.13-.54.21-.46.26-.38.3-.32.33-.24.35-.2.35-.14.33-.1.3-.06.26-.04.21-.02.13-.01h5.84l.69-.05.59-.14.5-.21.41-.28.33-.32.27-.35.2-.36.15-.36.1-.35.07-.32.04-.28.02-.21V6.07h2.09l.14.01zm-6.47 14.25-.23.33-.08.41.08.41.23.33.33.23.41.08.41-.08.33-.23.23-.33.08-.41-.08-.41-.23-.33-.33-.23-.41-.08-.41.08z" />}
  </svg>;
}

function useElapsedSeconds(startedAt: number | null, active: boolean): number {
  const observedAt = useRef(Date.now()).current;
  const anchor = startedAt ?? observedAt;
  const calculate = () => Math.max(0, Math.floor((Date.now() - anchor) / 1_000));
  const [elapsedSeconds, setElapsedSeconds] = useState(calculate);
  useEffect(() => {
    if (!active) return;
    const update = () => setElapsedSeconds(calculate());
    update();
    const interval = window.setInterval(update, 1_000);
    return () => window.clearInterval(interval);
  }, [active, anchor]);
  return elapsedSeconds;
}

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
  const showBashTimer = language === "Bash" && execution.status === "running";
  const elapsedSeconds = useElapsedSeconds(execution.startedAt, showBashTimer);
  const targetLabel = execution.executionTarget === "local"
    ? "Local"
    : execution.executionTarget === "modal" ? "Remote (legacy)" : null;
  const hasMetadata = targetLabel !== null || startedAt !== null || execution.durationMs !== null || showBashTimer;

  return <section
    className={`ipython-execution-card ${execution.status}`}
    aria-labelledby={titleId}
    aria-describedby={hasMetadata ? metadataId : undefined}
  >
    <details className="ipython-execution-source">
      <summary>
        <span className="ipython-execution-heading-copy">
          <span id={titleId} className="ipython-execution-language" title={language}><ExecutionLanguageIcon language={language} /><span className="sr-only">{language}</span></span>
          {hasMetadata && <span id={metadataId} className="ipython-execution-meta">
            {targetLabel && <span>{targetLabel}</span>}
            {startedAt && <time dateTime={startedAt.toISOString()}>{startedAt.toLocaleTimeString()}</time>}
            {showBashTimer && <span className="ipython-execution-counter" aria-label={execution.startedAt === null ? `Observed running for ${elapsedSeconds} seconds` : `Running for ${elapsedSeconds} seconds`}>{elapsedSeconds}s</span>}
            {execution.durationMs !== null && <span>{formatDuration(execution.durationMs)}</span>}
          </span>}
        </span>
        {execution.status === "succeeded"
          ? <span className="sr-only">Status: {statusLabel}</span>
          : <span className="ipython-execution-status" aria-label={`Status: ${statusLabel}`}>{statusLabel}</span>}
      </summary>
      <section className="ipython-execution-code" aria-label={`Executed ${language} input`}>
        <pre tabIndex={0}><HighlightedCode code={execution.code} language={language} /></pre>
      </section>
    </details>
    {execution.detail
      ? <ExecutionOutput detail={execution.detail} language={language} />
      : execution.status === "running" && <p className="ipython-execution-pending" role="status">Waiting for output…</p>}
  </section>;
}
