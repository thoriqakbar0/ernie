import { useCallback } from '@lynx-js/react'

import type { AgentActivity, AgentSession } from './daemon-client.js'
import type { ComponentAnnotation } from './component-annotation.js'

export type SidebarConnection = 'connecting' | 'ready' | 'unavailable'
export type SidebarWidth = 'balanced' | 'compact' | 'wide'

type AgentSidebarProps = Readonly<{
  connection: SidebarConnection
  currentCwd: string | null
  annotationMode?: boolean
  onAnnotate?: (annotation: ComponentAnnotation) => void
  onOpenSettings: () => void
  onSelect: (activeSessionId: string) => void
  onStartDraft: (cwd: string) => void
  selectedSessionId: string | null
  selectedAnnotationId?: string | null
  sessions: readonly AgentSession[]
  width: SidebarWidth
}>

const activityLabels = {
  idle: null,
  needs_input: 'needs input',
  queued: 'queued',
  settled: null,
  working: 'working',
} as const satisfies Readonly<Record<AgentActivity, string | null>>

const activityOrder = {
  working: 0,
  needs_input: 1,
  queued: 2,
  idle: 3,
  settled: 4,
} as const satisfies Readonly<Record<AgentActivity, number>>

function workspaceLabel(cwd: string): string {
  const parts = cwd.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? cwd
}

type AgentRowProps = Readonly<{
  annotationMode: boolean
  onAnnotate: (annotation: ComponentAnnotation) => void
  selectedAnnotationId: string | null
  onSelect: (activeSessionId: string) => void
  selected: boolean
  session: AgentSession
}>

function AgentRow({
  annotationMode,
  onAnnotate,
  onSelect,
  selected,
  selectedAnnotationId,
  session,
}: AgentRowProps) {
  const selectAgent = useCallback(() => {
    'background only'
    onSelect(session.activeSessionId)
  }, [onSelect, session.activeSessionId])
  const activityLabel = activityLabels[session.activity]
  const annotateAgent = useCallback(() => {
    'background only'
    onAnnotate({
      component: 'AgentRow',
      id: `agent-row-${session.activeSessionId}`,
      label: session.name,
      source: 'lynx/src/agent-sidebar.tsx',
    })
  }, [onAnnotate, session.activeSessionId, session.name])

  return (
    <view
      accessibility-label={`${session.name}${activityLabel === null ? '' : `, ${activityLabel}`}`}
      accessibility-role='button'
      bindtap={annotationMode ? undefined : selectAgent}
      catchtap={annotationMode ? annotateAgent : undefined}
      className={`ThreadRow ${selected ? 'ThreadRow--selected' : ''} ${annotationMode ? 'AnnotationTarget' : ''} ${selectedAnnotationId === `agent-row-${session.activeSessionId}` ? 'AnnotationTarget--selected' : ''}`}
    >
      <text className={`ThreadName ${session.activity === 'working' ? 'ThreadName--working' : ''}`}>
        {session.name}
      </text>
      {activityLabel === null ? null : (
        <text className={`ThreadActivity ThreadActivity--${session.activity}`}>
          {activityLabel}
        </text>
      )}
      <text className={`ThreadMenu ${selected ? 'ThreadMenu--visible' : ''}`}>•••</text>
    </view>
  )
}

/** ReactLynx port of Ernie's repository and live-Agent sidebar surface. */
export function AgentSidebar({
  annotationMode = false,
  connection,
  currentCwd,
  onAnnotate = () => undefined,
  onOpenSettings,
  onSelect,
  onStartDraft,
  selectedAnnotationId = null,
  selectedSessionId,
  sessions,
  width,
}: AgentSidebarProps) {
  const workspacePaths = [
    ...(currentCwd === null ? [] : [currentCwd]),
    ...sessions.map(session => session.cwd),
  ].filter((cwd, index, paths) => paths.indexOf(cwd) === index)

  return (
    <view className={`Roster Roster--${width}`}>
      <view
        catchtap={annotationMode ? () => {
          'background only'
          onAnnotate({
            component: 'AgentSidebar',
            id: 'sidebar-header',
            label: 'Repositories header',
            source: 'lynx/src/agent-sidebar.tsx',
          })
        } : undefined}
        className={`SidebarHeader ${annotationMode ? 'AnnotationTarget' : ''} ${selectedAnnotationId === 'sidebar-header' ? 'AnnotationTarget--selected' : ''}`}
      >
        <text className='SidebarHeading'>Repositories</text>
        <view
          accessibility-label='Add repository'
          accessibility-role='button'
          className='SidebarHeaderAction'
        >
          <text className='SidebarHeaderActionText'>＋</text>
        </view>
      </view>
      <scroll-view className='AgentList' scroll-y>
        {connection === 'connecting' ? (
          <text className='SidebarNotice'>Connecting to Prime Agent…</text>
        ) : null}
        {connection === 'unavailable' ? (
          <text className='SidebarNotice SidebarNotice--error'>
            Prime Agent unavailable
          </text>
        ) : null}
        {workspacePaths.map(cwd => {
          const workspaceSessions = sessions.filter(session => session.cwd === cwd)
          const needsInputCount = workspaceSessions.filter(
            session => session.activity === 'needs_input',
          ).length
          const workingCount = workspaceSessions.filter(
            session => session.activity === 'working',
          ).length
          const status = [
            needsInputCount > 0 ? `${needsInputCount} needs input` : null,
            workingCount > 0 ? `${workingCount} working` : null,
          ].filter(value => value !== null).join(' · ')
          return (
            <view className='RepositoryGroup' key={cwd}>
              <view
                catchtap={annotationMode ? () => {
                  'background only'
                  onAnnotate({
                    component: 'AgentSidebar',
                    id: `repository-${cwd}`,
                    label: `Repository ${workspaceLabel(cwd)}`,
                    source: 'lynx/src/agent-sidebar.tsx',
                  })
                } : undefined}
                className={`RepositoryRow ${annotationMode ? 'AnnotationTarget' : ''} ${selectedAnnotationId === `repository-${cwd}` ? 'AnnotationTarget--selected' : ''}`}
              >
                <text className='RepositoryChevron'>⌄</text>
                <view className='RepositoryFolder'>
                  <view className='RepositoryFolderTab' />
                </view>
                <text className='RepositoryName'>{workspaceLabel(cwd)}</text>
                <text className='RepositoryStatus'>{status}</text>
                <view
                  accessibility-label={`New Agent in ${workspaceLabel(cwd)}`}
                  accessibility-role='button'
                  bindtap={() => {
                    'background only'
                    onStartDraft(cwd)
                  }}
                  className='RepositoryAdd'
                >
                  <text className='RepositoryAddText'>＋</text>
                </view>
              </view>
              <view className='ThreadList'>
                {[...workspaceSessions]
                  .sort(
                    (left, right) =>
                      activityOrder[left.activity] - activityOrder[right.activity],
                  )
                  .map(session => (
                    <AgentRow
                      annotationMode={annotationMode}
                      key={session.activeSessionId}
                      onAnnotate={onAnnotate}
                      onSelect={onSelect}
                      selected={session.activeSessionId === selectedSessionId}
                      selectedAnnotationId={selectedAnnotationId}
                      session={session}
                    />
                  ))}
              </view>
            </view>
          )
        })}
      </scroll-view>
      <view
        accessibility-label={connection === 'ready' ? 'Settings' : `Ernie ${connection}`}
        accessibility-role='button'
        bindtap={annotationMode ? undefined : onOpenSettings}
        catchtap={annotationMode ? () => {
          'background only'
          onAnnotate({
            component: 'AgentSidebar',
            id: 'sidebar-footer',
            label: 'Settings footer',
            source: 'lynx/src/agent-sidebar.tsx',
          })
        } : undefined}
        className={`SidebarFooter ${annotationMode ? 'AnnotationTarget' : ''} ${selectedAnnotationId === 'sidebar-footer' ? 'AnnotationTarget--selected' : ''}`}
      >
        <view className='SidebarLogo'>
          <text className='SidebarLogoText'>E</text>
        </view>
        <text className='SidebarProduct'>Ernie</text>
        {connection === 'ready' ? null : (
          <text className={`SidebarConnection SidebarConnection--${connection}`}>
            {connection === 'connecting' ? 'Connecting…' : 'Prime Agent unavailable'}
          </text>
        )}
        <text className='SidebarSettings'>⚙</text>
      </view>
    </view>
  )
}
