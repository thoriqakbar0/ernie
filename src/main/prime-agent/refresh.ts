import type { PrimeSessionSnapshot, PrimeSessionSummary } from "../../packages/prime-agent"
import { projectPrimeSessionSnapshot } from "./projection"

type PrimeSessionRefreshInput = Readonly<{
  readSnapshot: () => Promise<unknown>
  previousSession: PrimeSessionSummary
  isCurrent: () => boolean
}>

export const projectCurrentPrimeSessionRefresh = async (
  input: PrimeSessionRefreshInput,
): Promise<PrimeSessionSnapshot | undefined> => {
  const snapshot = await input.readSnapshot()
  if (!input.isCurrent()) {
    return undefined
  }
  return projectPrimeSessionSnapshot(snapshot, input.previousSession)
}
