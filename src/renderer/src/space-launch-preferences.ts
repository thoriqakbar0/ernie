import type { AgentThinkingLevel } from "../../shared/spaceRuntime";

/** Persisted, non-sensitive launcher choices for one worktree. */
export interface SpaceLaunchPreference {
  readonly modelProvider?: string;
  readonly modelId?: string;
  readonly thinkingLevel: AgentThinkingLevel;
  readonly rlmMaxDepth: number;
}

interface StoragePort {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
}

const STORAGE_KEY = "ernie.space-launch-preferences.v1";
const MAX_PREFERENCES = 32;
const DEFAULT_PREFERENCE: SpaceLaunchPreference = { thinkingLevel: "low", rlmMaxDepth: 0 };
function parseThinkingLevel(value: unknown): AgentThinkingLevel {
  switch (value) {
    case "off": case "minimal": case "low": case "medium": case "high": case "xhigh": case "max": return value;
    default: return "low";
  }
}

type RecordValue = Readonly<Record<string, unknown>>;

function record(value: unknown): RecordValue | undefined {
  // SAFETY: the runtime checks establish a non-null, non-array object before record-style reads.
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as RecordValue : undefined;
}

function parsePreference(value: unknown): SpaceLaunchPreference | undefined {
  const candidate = record(value);
  const rlmMaxDepth = candidate?.["rlmMaxDepth"];
  if (typeof rlmMaxDepth !== "number" || !Number.isSafeInteger(rlmMaxDepth) || rlmMaxDepth < 0) return undefined;
  const modelProvider = candidate?.["modelProvider"];
  const modelId = candidate?.["modelId"];
  const thinkingLevel = parseThinkingLevel(candidate?.["thinkingLevel"]);
  if ((modelProvider === undefined) !== (modelId === undefined)) return undefined;
  if (modelProvider !== undefined && (typeof modelProvider !== "string" || modelProvider.length === 0 || modelProvider.length > 128)) return undefined;
  if (modelId !== undefined && (typeof modelId !== "string" || modelId.length === 0 || modelId.length > 512)) return undefined;
  return {
    thinkingLevel,
    rlmMaxDepth,
    ...(typeof modelProvider === "string" && typeof modelId === "string" ? { modelProvider, modelId } : {}),
  };
}

function readAll(storage: StoragePort): Map<string, SpaceLaunchPreference> {
  try {
    const decoded: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? "null");
    const root = record(decoded);
    if (root?.["version"] !== 1) return new Map();
    const entries = root["spaces"];
    if (!Array.isArray(entries)) return new Map();
    const parsed = new Map<string, SpaceLaunchPreference>();
    for (const entry of entries.slice(-MAX_PREFERENCES)) {
      if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" || entry[0].length === 0 || entry[0].length > 4_096) continue;
      const preference = parsePreference(entry[1]);
      if (preference) parsed.set(entry[0], preference);
    }
    return parsed;
  } catch {
    return new Map();
  }
}

/** Reads a worktree's saved launch selection, defaulting to low thinking and root-only depth. */
export function readSpaceLaunchPreference(storage: StoragePort, spaceId: string): SpaceLaunchPreference {
  return readAll(storage).get(spaceId) ?? DEFAULT_PREFERENCE;
}

/** Saves bounded per-worktree launcher configuration without persisting prompt text. */
export function writeSpaceLaunchPreference(storage: StoragePort, spaceId: string, preference: SpaceLaunchPreference): void {
  const parsed = parsePreference(preference);
  if (!spaceId || spaceId.length > 4_096 || !parsed) return;
  const all = readAll(storage);
  all.delete(spaceId);
  all.set(spaceId, parsed);
  while (all.size > MAX_PREFERENCES) {
    const oldest = all.keys().next().value;
    if (typeof oldest !== "string") break;
    all.delete(oldest);
  }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, spaces: [...all] }));
  } catch {
    // Preferences are best effort; runtime configuration remains authoritative.
  }
}
