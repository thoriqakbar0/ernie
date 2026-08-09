import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { WorkspaceAgent } from "../src/shared/workspace";
import { SessionTranscriptView } from "../src/renderer/src/SessionTranscriptView";

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

});
