// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceAgent } from "../src/shared/workspace";
import { SessionTranscriptView } from "../src/renderer/src/session-transcript-view";

const subagent: WorkspaceAgent = {
  id: "child/1",
  sessionId: "session-child",
  worktreeId: "worktree",
  parentAgentId: "root",
  name: "Researcher",
  summary: "Checks primary sources",
  status: "working",
  runtimeKind: "subagent",
};

describe("SessionTranscriptView source context", () => {
  it("identifies a selected subagent transcript semantically", () => {
    const html = renderToStaticMarkup(<SessionTranscriptView
      agent={subagent}
      locationLabel="Ernie · feature/sidebar"
      items={[]}
      state="ready"
      onRetry={() => {}}
      renderItem={() => null}
    />);

    expect(html).toContain('class="session-transcript-view subagent-source"');
    expect(html).toContain('data-transcript-source="subagent"');
    expect(html).toContain('aria-describedby="transcript-source-child%2F1"');
    expect(html).toContain("Source: Researcher, subagent session.");
  });

  it("does not overlay an error banner on a preserved transcript", () => {
    const html = renderToStaticMarkup(<SessionTranscriptView
      agent={subagent}
      locationLabel="Ernie · feature/sidebar"
      items={[{ id: "message", kind: "notice", text: "Existing transcript", tone: "neutral" }]}
      state="error"
      onRetry={() => {}}
      renderItem={() => <div>Existing transcript</div>}
    />);

    expect(html).not.toContain("Live updates stopped");
    expect(html).not.toContain("session-stream-error");
    expect(html).toContain("Existing transcript");
  });

  it("integrates Space and worktree context with the current session", () => {
    const html = renderToStaticMarkup(<SessionTranscriptView
      agent={subagent}
      locationLabel="Ernie · feature/sidebar"
      items={[]}
      state="ready"
      onRetry={() => {}}
      renderItem={() => null}
    />);

    expect(html).toContain("Ernie · feature/sidebar");
    expect(html).toContain("Researcher");
    expect(html).toContain('aria-label="Current location: Ernie · feature/sidebar / Researcher"');
  });

  it("renames the selected session through its visible name", async () => {
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
    vi.stubGlobal("prompt", vi.fn(() => "  Better   session name  "));
    const onRename = vi.fn().mockResolvedValue(undefined);
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => root.render(<SessionTranscriptView
      agent={{ ...subagent, runtimeKind: "root" }}
      locationLabel="Ernie · feature/sidebar"
      items={[]}
      state="ready"
      onRetry={() => {}}
      onRename={onRename}
      renderItem={() => null}
    />));
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Rename Researcher"]')?.click());

    expect(onRename).toHaveBeenCalledWith("Better session name");
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  });

});
