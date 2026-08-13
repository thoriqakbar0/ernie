import type { ActiveAgent } from './daemon-roster.js'

interface RawSessionPanelProps {
  readonly session: ActiveAgent | null
}

/** Show the complete selected session payload received from Prime Agent. */
export function RawSessionPanel({ session }: RawSessionPanelProps) {
  if (session === null) {
    return (
      <view className='RawSessionPanel RawSessionPanel--empty'>
        <text className='RawSessionEmptyTitle'>Select an Agent</text>
        <text className='RawSessionEmptyText'>
          Its raw Prime Agent session data will appear here.
        </text>
      </view>
    )
  }

  const metadata = {
    activeSessionId: session.activeSessionId,
    activity: session.activity,
    cwd: session.cwd,
    model: session.model,
    modifiedAt: session.modifiedAt,
    name: session.name,
    sessionPath: session.sessionPath,
  }
  const metadataText = JSON.stringify(metadata, null, 2) ?? ''
  const jsonlText = session.sessionJsonl?.trimEnd() ?? ''

  return (
    <view className='RawSessionPanel'>
      <view className='RawSessionHeader'>
        <text className='RawSessionTitle'>{session.name}</text>
        <text className='RawSessionSubtitle'>Raw Prime Agent session</text>
      </view>
      <scroll-view
        bounces={true}
        className='RawSessionScroll'
        scroll-bar-enable={true}
        scroll-orientation='vertical'
      >
        <view className='RawSessionCode'>
          <text className='RawSessionSectionTitle'>Session metadata</text>
          <text className='RawSessionBlock'>{metadataText}</text>
          <text className='RawSessionSectionTitle RawSessionSectionTitle--jsonl'>
            Session JSONL
          </text>
          {jsonlText.length === 0 ? (
            <text className='RawSessionUnavailable'>Session JSONL is unavailable.</text>
          ) : (
            <text className='RawSessionBlock'>{jsonlText}</text>
          )}
        </view>
      </scroll-view>
    </view>
  )
}
