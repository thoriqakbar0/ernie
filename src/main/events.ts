import type {
  PrimeSessionChangeEnvelope,
  PrimeSessionSnapshotEnvelope,
  PrimeSessionState,
} from "../packages/prime-agent"

export type Events = {
  primeSessionStateChanged: PrimeSessionState
  primeSessionChanged: PrimeSessionChangeEnvelope
  primeSessionSnapshot: PrimeSessionSnapshotEnvelope
}
