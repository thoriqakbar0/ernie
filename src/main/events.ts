import type { UpdateState } from "../packages/updates"
import type {
  PrimeSessionChangeEnvelope,
  PrimeSessionSnapshotEnvelope,
  PrimeSessionState,
} from "../packages/prime-agent"

export type Events = {
  updateStateChanged: UpdateState
  primeSessionStateChanged: PrimeSessionState
  primeSessionChanged: PrimeSessionChangeEnvelope
  primeSessionSnapshot: PrimeSessionSnapshotEnvelope
}
