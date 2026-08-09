import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SessionSurface } from "../src/renderer/src/components/workspace-shell/workspace-shell";
import type { WorkspaceSnapshot } from "../src/shared/workspace";

const emptyWorkspace: WorkspaceSnapshot = {
  projects: [],
  worktrees: [],
  agents: [],
  updatedAt: "2026-08-08T00:00:00.000Z",
};

function renderEmpty(opening = false, openError?: string) {
  return renderToStaticMarkup(<SessionSurface
    snapshot={emptyWorkspace}
    agentId={undefined}
    loading={false}
    activeProject={undefined}
    runtimeState={undefined}
    liveItems={[]}
    opening={opening}
    openError={openError}
    spacePromptDraft=""
    onSpacePromptDraftChange={() => {}}
    onAppendLiveUser={() => {}}
    onRuntimeState={() => {}}
    onStarted={() => {}}
    onShowAgentHierarchy={() => {}}
    onSelectProject={() => {}}
    onOpenDirectory={() => {}}
  />);
}

describe("WorkspaceShell empty workspace", () => {
  it("brings the project-opening action into the main empty state", () => {
    const html = renderEmpty();
    expect(html).toContain("What should we work on?");
    expect(html).toContain("Open a folder to add your first space.");
    expect(html).toContain(">Open folder</span>");
    expect(html).toContain('class="focused-empty-hero"');
  });

  it("keeps opening and failure feedback with the empty action", () => {
    const html = renderEmpty(true, "Folder access was denied.");
    expect(html).toContain("disabled");
    expect(html).toContain("Opening folder…");
    expect(html).toContain('role="alert"');
    expect(html).toContain("Folder access was denied.");
  });
});
