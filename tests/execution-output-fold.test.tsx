// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ExecutionOutput } from "../src/renderer/src/ExecutionOutput";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });

const originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight");
const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get() { return this.classList.contains("execution-output-fold-content") && (this.textContent?.length ?? 0) > 100 ? 400 : 100; },
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() { return this.classList.contains("execution-output-fold-content") ? 280 : 100; },
  });
});

afterEach(() => {
  if (originalScrollHeight) Object.defineProperty(HTMLElement.prototype, "scrollHeight", originalScrollHeight);
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollHeight");
  if (originalClientHeight) Object.defineProperty(HTMLElement.prototype, "clientHeight", originalClientHeight);
  else Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
});

describe("ExecutionOutput folding", () => {
  it("clamps long output until the user expands it", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const output = "line of output\n".repeat(20);

    await act(async () => root.render(<ExecutionOutput detail={output} language="Bash" />));
    const toggle = container.querySelector<HTMLButtonElement>(".execution-output-fold-toggle");
    expect(toggle?.textContent).toBe("Show all output");
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).toContain("line of output");

    await act(async () => toggle?.click());
    expect(toggle?.textContent).toBe("Collapse output");
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    await act(async () => root.unmount());
  });

  it("does not add a disclosure to short output", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<ExecutionOutput detail="Done" language="Bash" />));
    expect(container.querySelector(".execution-output-fold-toggle")).toBeNull();
    await act(async () => root.unmount());
  });
});
