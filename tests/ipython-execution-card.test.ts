import { describe, expect, it } from "vitest";
import { executionLanguage } from "../src/renderer/src/IPythonExecutionCard";

describe("executionLanguage", () => {
  it("recognizes Bash cell magics after leading whitespace", () => {
    expect(executionLanguage("  %%bash\necho hello")).toBe("Bash");
  });

  it("keeps ordinary scratchpad code labeled as IPython", () => {
    expect(executionLanguage("print(\"hello\")")).toBe("IPython");
  });
});
