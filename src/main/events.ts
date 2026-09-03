import type {
  PrimeSessionChangeEnvelope,
  PrimeSessionSnapshotEnvelope,
} from "../packages/prime-agent"

export type Events = {
  primeSessionChanged: PrimeSessionChangeEnvelope
  primeSessionSnapshot: PrimeSessionSnapshotEnvelope
  primeSessionSelected: { sessionId?: string }
}
