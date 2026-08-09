import type { WorkspaceAgent } from "../../../shared/workspace";

/** Test whether normalized query text appears in any supplied value. */
export function matchesSearch(query: string, values: readonly (string | undefined)[]): boolean {
  return values.some((value) => value?.toLocaleLowerCase().includes(query));
}

/** Include direct agent matches and their ancestors so grouped results stay connected. */
export function agentIdsWithAncestors(agents: readonly WorkspaceAgent[], matches: readonly WorkspaceAgent[]): ReadonlySet<string> {
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  const included = new Set(matches.map((agent) => agent.id));
  for (const match of matches) {
    let current = match;
    for (let depth = 0; depth < agents.length && current.parentAgentId !== undefined; depth += 1) {
      const parent = byId.get(current.parentAgentId);
      if (parent === undefined || included.has(parent.id)) break;
      included.add(parent.id);
      current = parent;
    }
  }
  return included;
}
