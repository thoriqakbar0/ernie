import { usePrimeSessionSnapshot } from "../prime-agent-state"
import { SubagentActivity } from "./subagent-activity"

/** Reads the existing snapshot cache; child inspection starts only when opened. */
export const SessionSubagentParticipants = ({ sessionId }: { sessionId?: string }) => {
  const { data } = usePrimeSessionSnapshot(sessionId)
  return data ? <SubagentActivity key={data.session.id} snapshot={data} /> : null
}
