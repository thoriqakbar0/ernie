// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { SpaceLaunchpad } from "../src/renderer/src/SpaceLaunchpad";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });

const baseProps = () => ({
  spaceId: "space-ernie",
  spaceLabel: "ernie",
  worktreeLabel: "main",
  projects: [{ id: "space-ernie", label: "ernie", path: "/work/ernie" }, { id: "space-t3", label: "t3", path: "/work/t3" }],
  onSelectProject: vi.fn(),
  onOpenDirectory: vi.fn(),
  openingDirectory: false,
  openDirectoryError: undefined,
  models: [{ id: "openai-codex:gpt", label: "GPT", provider: "openai-codex", thinkingLevels: ["off", "low", "high"] as const }],
  selectedModelId: "openai-codex:gpt",
  modelsLoading: false,
  modelsError: null,
  onModelChange: vi.fn(),
  selectedThinkingLevel: "low" as const,
  onThinkingLevelChange: vi.fn(),
  rlmMaxDepth: 0,
  onRlmMaxDepthChange: vi.fn(),
  onRetryModels: vi.fn(),
  promptDraft: "Build it",
  onPromptDraftChange: vi.fn(),
  busy: false,
  error: null,
  onSubmit: vi.fn(),
});

describe("SpaceLaunchpad draft composer", () => {
  it("switches Spaces, opens a project, and submits the provider-qualified draft", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const props = baseProps();
    await act(async () => root.render(<SpaceLaunchpad {...props} />));

    expect(container.querySelector("h1")?.textContent).toContain("What should we build in ernie");
    expect(container.querySelector("textarea")?.getAttribute("placeholder")).toBe("Ask anything");

    const projectTrigger = container.querySelector<HTMLButtonElement>(".space-launchpad-project-trigger");
    await act(async () => projectTrigger?.click());
    expect(projectTrigger?.getAttribute("aria-expanded")).toBe("true");
    const projectItems = [...container.querySelectorAll<HTMLButtonElement>("[role='menuitemradio']")];
    await act(async () => projectItems.find((item) => item.textContent?.includes("t3"))?.click());
    expect(props.onSelectProject).toHaveBeenCalledWith("space-t3");

    await act(async () => projectTrigger?.click());
    const newProject = container.querySelector<HTMLButtonElement>("[role='menuitem']");
    await act(async () => newProject?.click());
    expect(props.onOpenDirectory).toHaveBeenCalledOnce();

    const send = container.querySelector<HTMLButtonElement>(".space-launchpad-submit");
    expect(send?.getAttribute("aria-label")).toBe("Send message");
    expect(send?.disabled).toBe(false);
    await act(async () => container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(props.onSubmit).toHaveBeenCalledWith({ prompt: "Build it", modelId: "openai-codex:gpt", thinkingLevel: "low", rlmMaxDepth: 0 });
    await act(async () => root.unmount());
  });

  it("supports keyboard project navigation, restores focus, and closes the menu when busy", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const props = { ...baseProps(), openDirectoryError: "Folder access was denied." };
    await act(async () => root.render(<SpaceLaunchpad {...props} />));

    const trigger = container.querySelector<HTMLButtonElement>(".space-launchpad-project-trigger");
    await act(async () => {
      trigger?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(container.querySelector("[role='menu']")).not.toBeNull();
    expect(document.activeElement?.getAttribute("role")).toBe("menuitemradio");

    await act(async () => document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await act(async () => { await new Promise((resolve) => requestAnimationFrame(resolve)); });
    expect(container.querySelector("[role='menu']")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(container.querySelector("[role='alert']")?.textContent).toContain("Folder access was denied");

    await act(async () => trigger?.click());
    expect(container.querySelector("[role='menu']")).not.toBeNull();
    await act(async () => root.render(<SpaceLaunchpad {...props} busy />));
    expect(container.querySelector("[role='menu']")).toBeNull();
    await act(async () => root.unmount());
    container.remove();
  });

  it("exposes model-aware thinking and advanced RLM depth controls", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const props = baseProps();
    await act(async () => root.render(<SpaceLaunchpad {...props} />));

    const thinking = container.querySelector<HTMLSelectElement>(".space-launchpad-thinking-select");
    expect([...thinking?.options ?? []].map((option) => option.value)).toEqual(["off", "low", "high"]);
    await act(async () => {
      if (!thinking) return;
      thinking.value = "high";
      thinking.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(props.onThinkingLevelChange).toHaveBeenCalledWith("high");

    await act(async () => container.querySelector<HTMLButtonElement>(".space-launchpad-advanced-trigger")?.click());
    const depthPreset = container.querySelector<HTMLSelectElement>(".space-launchpad-advanced-popover select");
    await act(async () => {
      if (!depthPreset) return;
      depthPreset.value = "2";
      depthPreset.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(props.onRlmMaxDepthChange).toHaveBeenCalledWith(2);
    expect(container.querySelector("[role='dialog']")?.textContent).toContain("Root only");
    await act(async () => root.unmount());
  });


});
