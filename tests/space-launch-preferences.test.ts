import { describe, expect, it } from "vitest";
import { readSpaceLaunchPreference, writeSpaceLaunchPreference } from "../src/renderer/src/spaceLaunchPreferences";

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set("ernie.space-launch-preferences.v1", initial);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

describe("Space launch preferences", () => {
  it("defaults to root-only depth when storage is empty or malformed", () => {
    expect(readSpaceLaunchPreference(memoryStorage(), "ernie")).toEqual({ rlmMaxDepth: 0 });
    expect(readSpaceLaunchPreference(memoryStorage("not json"), "ernie")).toEqual({ rlmMaxDepth: 0 });
  });

  it("round-trips model and arbitrary non-negative depth per Space", () => {
    const storage = memoryStorage();
    writeSpaceLaunchPreference(storage, "ernie", { modelProvider: "openai-codex", modelId: "gpt-5.6", rlmMaxDepth: 7 });
    writeSpaceLaunchPreference(storage, "garden", { rlmMaxDepth: 0 });
    expect(readSpaceLaunchPreference(storage, "ernie")).toEqual({ modelProvider: "openai-codex", modelId: "gpt-5.6", rlmMaxDepth: 7 });
    expect(readSpaceLaunchPreference(storage, "garden")).toEqual({ rlmMaxDepth: 0 });
  });

  it("does not persist invalid negative depth", () => {
    const storage = memoryStorage();
    writeSpaceLaunchPreference(storage, "ernie", { rlmMaxDepth: -1 });
    expect(readSpaceLaunchPreference(storage, "ernie")).toEqual({ rlmMaxDepth: 0 });
  });
});
