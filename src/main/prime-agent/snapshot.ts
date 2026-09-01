import type { PrimeSessionSnapshot } from "../../packages/prime-agent"

type EnrichPrimeSessionSnapshotInput = Readonly<{
  snapshot: unknown
  previous?: PrimeSessionSnapshot
}>

export function enrichPrimeSessionSnapshot(
  input: EnrichPrimeSessionSnapshotInput,
): unknown {
  if (typeof input.snapshot !== "object" || input.snapshot === null || Array.isArray(input.snapshot)) {
    throw new Error("Prime Agent returned an invalid connection snapshot")
  }

  const snapshot = input.snapshot as Record<string, unknown>
  return {
    ...snapshot,
    ...preservedField("parent", snapshot.parent, input.previous?.useful.parent),
    ...preservedField("replay", snapshot.replay, input.previous?.useful.replay),
  }
}

function preservedField<Name extends string>(
  name: Name,
  current: unknown,
  fallback: unknown,
) {
  const value = current === undefined ? fallback : current
  return value === undefined ? {} : { [name]: value }
}
