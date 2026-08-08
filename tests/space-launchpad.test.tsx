// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { SpaceLaunchpad } from "../src/renderer/src/SpaceLaunchpad";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });

describe("SpaceLaunchpad delegation", () => {
  it("keeps delegation off by default and restores the selected intensity", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const onRlmMaxDepthChange = vi.fn();
    await act(async () => root.render(<SpaceLaunchpad
      spaceLabel="ernie"
      worktreeLabel="main"
      models={[{ id: "openai-codex:gpt", label: "GPT", provider: "openai-codex" }]}
      selectedModelId="openai-codex:gpt"
      modelsLoading={false}
      modelsError={null}
      onModelChange={vi.fn()}
      rlmMaxDepth={0}
      onRlmMaxDepthChange={onRlmMaxDepthChange}
      onRetryModels={vi.fn()}
      promptDraft="Build it"
      onPromptDraftChange={vi.fn()}
      busy={false}
      error={null}
      onSubmit={vi.fn()}
    />));

    const toggle = container.querySelector<HTMLInputElement>(".space-launchpad-delegation-toggle");
    expect(toggle?.checked).toBe(false);
    expect(container.querySelector("input[type='range']")).toBeNull();
    expect(container.querySelector(".space-launchpad-intensity-control")?.textContent).toContain("Off");

    await act(async () => toggle?.click());
    expect(toggle?.checked).toBe(true);
    expect(onRlmMaxDepthChange).toHaveBeenLastCalledWith(1);
    const range = container.querySelector<HTMLInputElement>("input[type='range']");
    expect(range).not.toBeNull();

    await act(async () => {
      if (!range) return;
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(range, "3");
      range.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onRlmMaxDepthChange).toHaveBeenLastCalledWith(3);
    expect(container.querySelector(".space-launchpad-intensity-control")?.textContent).toContain("On · High");

    await act(async () => toggle?.click());
    expect(onRlmMaxDepthChange).toHaveBeenLastCalledWith(0);
    await act(async () => toggle?.click());
    expect(onRlmMaxDepthChange).toHaveBeenLastCalledWith(3);
    await act(async () => root.unmount());
  });
});
