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

  const lines = (JSON.stringify(session, null, 2) ?? '').split('\n')

  return (
    <view className='RawSessionPanel'>
      <view className='RawSessionHeader'>
        <text className='RawSessionTitle'>{session.name}</text>
        <text className='RawSessionSubtitle'>Raw Prime Agent session</text>
      </view>
      <scroll-view
        className='RawSessionScroll'
        scroll-bar-enable={true}
        scroll-orientation='vertical'
      >
        <view className='RawSessionCode'>
          {lines.map((line, index) => (
            <text className='RawSessionLine' key={`${index}:${line}`}>{line}</text>
          ))}
        </view>
      </scroll-view>
    </view>
  )
}
