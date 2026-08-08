import { describe, expect, it } from "vitest";
import {
  closeSpaceSessionTab,
  emptySpaceSessionTabs,
  openSpaceSessionTab,
  reconcileProvisionalSessionTab,
  selectSpaceSessionTab,
  tabsForSpace,
} from "../src/renderer/src/spaceSessionTabs";

describe("Space-local session tabs", () => {
  it("keeps independent tab sets and active sessions for each Space", () => {
    const first = openSpaceSessionTab(emptySpaceSessionTabs(), "ernie", "agent-a");
    const withSecondSpace = openSpaceSessionTab(first, "garden", "agent-b");
    const withAnotherGardenTab = openSpaceSessionTab(withSecondSpace, "garden", "agent-c");

    expect(tabsForSpace(withAnotherGardenTab, "ernie")).toEqual({ agentIds: ["agent-a"], activeAgentId: "agent-a" });
    expect(tabsForSpace(withAnotherGardenTab, "garden")).toEqual({ agentIds: ["agent-b", "agent-c"], activeAgentId: "agent-c" });
  });

  it("closes a view only in its Space and selects the nearest local neighbor", () => {
    let state = openSpaceSessionTab(emptySpaceSessionTabs(), "ernie", "one");
    state = openSpaceSessionTab(state, "ernie", "two");
    state = openSpaceSessionTab(state, "garden", "three");
    const closed = closeSpaceSessionTab(state, "ernie", "two");

    expect(tabsForSpace(closed, "ernie")).toEqual({ agentIds: ["one"], activeAgentId: "one" });
    expect(tabsForSpace(closed, "garden")).toEqual({ agentIds: ["three"], activeAgentId: "three" });
  });

  it("cannot focus a session through the wrong Space", () => {
    const state = openSpaceSessionTab(emptySpaceSessionTabs(), "ernie", "agent-a");
    expect(selectSpaceSessionTab(state, "garden", "agent-a")).toBe(state);
  });

  it("reconciles provisional RPC identity inside the existing Space", () => {
    let state = openSpaceSessionTab(emptySpaceSessionTabs(), "ernie", "rpc:current");
    state = openSpaceSessionTab(state, "garden", "rpc:garden");
    const reconciled = reconcileProvisionalSessionTab(state, "ernie", "stable-root");

    expect(tabsForSpace(reconciled, "ernie")).toEqual({ agentIds: ["stable-root"], activeAgentId: "stable-root" });
    expect(tabsForSpace(reconciled, "garden")).toEqual({ agentIds: ["rpc:garden"], activeAgentId: "rpc:garden" });
  });
});
