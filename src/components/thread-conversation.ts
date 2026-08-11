import type {
  PrimeAgentSavedSession,
  PrimeAgentSession,
} from '@/packages/prime-agent-daemon/client';

/** One canonical thread row, whether resident or only stored on disk. */
export type ThreadConversation =
  | Readonly<{ kind: 'live'; session: PrimeAgentSession }>
  | Readonly<{ kind: 'saved'; session: PrimeAgentSavedSession }>;

/** Return a durable identity shared by live and saved views of one session. */
export function threadConversationId(conversation: ThreadConversation): string {
  if (conversation.kind === 'saved') {
    return `session:${conversation.session.path}`;
  }
  return conversation.session.sessionPath === null
    ? `live:${conversation.session.activeSessionId}`
    : `session:${conversation.session.sessionPath}`;
}
