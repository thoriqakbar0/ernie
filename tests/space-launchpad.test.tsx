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

  it("uses accessible dropdown components for model and thinking effort without Advanced", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const props = baseProps();
    await act(async () => root.render(<SpaceLaunchpad {...props} />));

    expect(container.querySelector("select")).toBeNull();
    expect(container.querySelector(".space-launchpad-advanced-trigger")).toBeNull();
    const thinkingTrigger = container.querySelector<HTMLButtonElement>(".space-launchpad-dropdown.thinking .space-launchpad-dropdown-trigger");
    expect(thinkingTrigger?.textContent).toContain("Low effort");
    expect(thinkingTrigger?.getAttribute("aria-haspopup")).toBe("listbox");

    await act(async () => thinkingTrigger?.click());
    const thinkingListbox = container.querySelector<HTMLElement>(".space-launchpad-dropdown.thinking [role='listbox']");
    expect(thinkingListbox?.getAttribute("aria-label")).toBe("Thinking effort");
    const options = [...thinkingListbox?.querySelectorAll<HTMLButtonElement>("[role='option']") ?? []];
    expect(options.map((option) => option.textContent)).toEqual(["Off", "Low effort", "High effort"]);
    expect(options[1]?.tabIndex).toBe(0);
    await act(async () => options[1]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })));
    expect(options[0]?.tabIndex).toBe(0);
    expect(options[1]?.tabIndex).toBe(-1);
    expect(document.activeElement).toBe(options[0]);
    await act(async () => {
      options[2]?.click();
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(props.onThinkingLevelChange).toHaveBeenCalledWith("high");
    expect(thinkingTrigger?.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(thinkingTrigger);

    const modelTrigger = container.querySelector<HTMLButtonElement>(".space-launchpad-dropdown.model .space-launchpad-dropdown-trigger");
    await act(async () => {
      modelTrigger?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(document.activeElement?.getAttribute("role")).toBe("option");
    await act(async () => document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await act(async () => { await new Promise((resolve) => requestAnimationFrame(resolve)); });
    expect(document.activeElement).toBe(modelTrigger);

    await act(async () => root.unmount());
    container.remove();
  });


});
