import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { executionLanguage, IPythonExecutionCard } from "../src/renderer/src/components/execution/ipython-execution-card";
import type { ThreadItem } from "../src/renderer/src/lib/transcript";

type ExecutionItem = Extract<ThreadItem, { readonly kind: "ipython_execution" }>;

const completedExecution = {
  id: "execution-1",
  kind: "ipython_execution",
  callId: "call-1",
  executionTarget: "local",
  status: "succeeded",
  code: "print(42)",
  detail: "42",
  startedAt: null,
  durationMs: 12,
} satisfies ExecutionItem;

describe("executionLanguage", () => {
  it("recognizes Bash cell magics after leading whitespace", () => {
    expect(executionLanguage("  %%bash\necho hello")).toBe("Bash");
  });

  it("keeps ordinary scratchpad code labeled as IPython", () => {
    expect(executionLanguage("print(\"hello\")")).toBe("IPython");
  });
});


describe("IPythonExecutionCard status", () => {
  it("keeps routine success assistive-only", () => {
    const markup = renderToStaticMarkup(createElement(IPythonExecutionCard, { execution: completedExecution }));
    expect(markup).not.toContain("ipython-execution-status");
    expect(markup).toContain("Status: Completed");
  });

  it("keeps exceptional status visible", () => {
    const markup = renderToStaticMarkup(createElement(IPythonExecutionCard, {
      execution: { ...completedExecution, status: "failed" },
    }));
    expect(markup).toContain("ipython-execution-status");
    expect(markup).toContain("Failed");
  });
});
