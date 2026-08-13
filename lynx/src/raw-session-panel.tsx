import { useState } from '@lynx-js/react'

import type { ActiveAgent } from './daemon-roster.js'

interface RawSessionPanelProps {
  readonly session: ActiveAgent | null
}

const jsonlBatchSize = 200

/** Show the complete selected session payload received from Prime Agent. */
export function RawSessionPanel({ session }: RawSessionPanelProps) {
  const [visibleWindow, setVisibleWindow] = useState({
    lineCount: jsonlBatchSize,
    sessionId: '',
  })

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
  const jsonlLines = jsonlText.length === 0 ? [] : jsonlText.split('\n')
  const visibleLineCount = visibleWindow.sessionId === session.activeSessionId
    ? visibleWindow.lineCount
    : jsonlBatchSize
  const visibleJsonlText = jsonlLines.slice(0, visibleLineCount).join('\n')
  const remainingLineCount = Math.max(0, jsonlLines.length - visibleLineCount)

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
          {visibleJsonlText.length === 0 ? (
            <text className='RawSessionUnavailable'>Session JSONL is unavailable.</text>
          ) : (
            <text className='RawSessionBlock'>{visibleJsonlText}</text>
          )}
          {remainingLineCount === 0 ? null : (
            <view
              accessibility-element={true}
              accessibility-label={`Show 200 more JSONL lines, ${remainingLineCount} remaining`}
              accessibility-traits='button'
              bindtap={() => setVisibleWindow({
                lineCount: visibleLineCount + jsonlBatchSize,
                sessionId: session.activeSessionId,
              })}
              className='RawSessionMore'
              focusable={true}
            >
              <text className='RawSessionMoreText'>
                Show 200 more · {remainingLineCount} remaining
              </text>
            </view>
          )}
        </view>
      </scroll-view>
    </view>
  )
}
