import { describe, expect, it } from "vitest";
import type { AgentSlashCommand } from "../src/shared/commands";
import { matchingCommands } from "../src/renderer/src/composer-autocomplete";

const commands: readonly AgentSlashCommand[] = [
  { name: "skill:research", description: "Research primary sources", source: "skill" },
  { name: "fix-tests", description: "Repair the test suite", source: "prompt" },
  { name: "session-name", description: "Rename this session", source: "extension" },
];

describe("matchingCommands", () => {
  it("offers commands and skills for a slash-prefixed token", () => {
    expect(matchingCommands(commands, "/res").map(({ name }) => name)).toEqual(["skill:research"]);
    expect(matchingCommands(commands, "/test").map(({ name }) => name)).toEqual(["fix-tests"]);
  });

  it("stops suggesting after command arguments begin", () => {
    expect(matchingCommands(commands, "skill:research")).toEqual([]);
    expect(matchingCommands(commands, "/skill:research topic")).toEqual([]);
  });
});
