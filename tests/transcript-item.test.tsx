import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TranscriptItem } from "../src/renderer/src/components/sessions/transcript-item";

describe("TranscriptItem assistant attribution", () => {
  it("integrates a clickable session-level subagent count into the role label", () => {
    const html = renderToStaticMarkup(<TranscriptItem
      item={{ id: "answer", kind: "assistant", segments: ["Done."], active: false }}
      assistantLabel="Prime Agent"
      assistantSubagentCount={3}
      assistantRunningSubagentCount={2}
      onShowAssistantHierarchy={() => {}}
    />);

    expect(html).toContain("Prime Agent <span>with 3 subagents</span>");
    expect(html).toContain("Show Prime Agent with 3 subagents, 2 running in the trace");
    expect(html).toContain("chat-message-attribution running-subagents");
  });

  it("keeps waiting subagent attribution visible without the running shimmer", () => {
    const html = renderToStaticMarkup(<TranscriptItem
      item={{ id: "answer", kind: "assistant", segments: ["Waiting."], active: false }}
      assistantLabel="Prime Agent"
      assistantSubagentCount={1}
      onShowAssistantHierarchy={() => {}}
    />);

    expect(html).toContain("Prime Agent <span>with 1 subagent</span>");
    expect(html).not.toContain("running-subagents");
  });

  it("keeps the role label inert when the session has no subagents", () => {
    const html = renderToStaticMarkup(<TranscriptItem
      item={{ id: "answer", kind: "assistant", segments: ["Done."], active: false }}
      assistantLabel="Prime Agent"
    />);

    expect(html).toContain('<div class="chat-message-role">Prime Agent</div>');
    expect(html).not.toContain("chat-message-attribution");
  });

  it("labels locally detected steer admissions", () => {
    const html = renderToStaticMarkup(<TranscriptItem
      item={{ id: "steer", kind: "user", text: "Change direction", steered: true }}
      assistantLabel="Prime Agent"
    />);

    expect(html).toContain('<div class="chat-message-role">You steered</div>');
  });

  it("bounds long user-authored messages to one internal scroll surface", () => {
    const styles = readFileSync(resolve(process.cwd(), "src/renderer/src/styles.css"), "utf8");
    expect(styles).toContain(".chat-message.user .chat-message-copy{max-height:min(50vh,420px);overflow:auto");
  });

  it("renders one stable child trace row with timing, latest action, findings, and transcript access", () => {
    const html = renderToStaticMarkup(<TranscriptItem
      item={{ id: "child-row", kind: "delegation", childId: "child", activeSessionId: "child-active", name: "test-reviewer", task: "Review auth tests", status: "done", detail: "Two missing boundary tests", startedAt: 1_000, updatedAt: 6_000 }}
      assistantLabel="Prime Agent"
      onOpenDelegationTranscript={() => {}}
    />);

    expect(html).toContain("test-reviewer");
    expect(html).toContain("Review auth tests");
    expect(html).toContain("done");
    expect(html).toContain("5s");
    expect(html).toContain("Latest action:");
    expect(html).toContain("Returned findings");
    expect(html).toContain("Two missing boundary tests");
    expect(html).toContain("Open transcript");
    expect(html).not.toContain("open=\"\"");
  });
});
