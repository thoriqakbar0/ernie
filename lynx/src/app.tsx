import { useCallback, useEffect, useState } from '@lynx-js/react'
import type { BaseEvent, InputConfirmEvent, InputInputEvent } from '@lynx-js/types'

import './app.css'
import { AgentSidebar, type SidebarConnection, type SidebarWidth } from './agent-sidebar.js'
import {
  formatAnnotationContext,
  type ComponentAnnotation,
} from './component-annotation.js'
import {
  copyAnnotationContext,
  createAgentSession,
  loadAgentWorkspace,
  submitAgentTask,
  type AgentSession,
  type AgentWorkspace,
} from './daemon-client.js'
import { primeAgentHarness } from './daemon-contract.js'

type ComposerSize = 'focused' | 'roomy'

type ConversationMessage = Readonly<{
  id: string
  role: 'assistant' | 'user'
  text: string
}>

const activityLabels = {
  idle: 'Idle',
  needs_input: 'Needs input',
  queued: 'Queued',
  settled: 'Settled',
  working: 'Working',
} as const

function connectedMessage(session: AgentSession): ConversationMessage {
  return {
    id: `connected-${session.activeSessionId}`,
    role: 'assistant',
    text: 'Connected to this live Prime Agent session. New tasks go through the local Ernie daemon bridge.',
  }
}

/** Render Ernie's customizable ReactLynx client for the live Agent daemon. */
export function App() {
  const [composerSize, setComposerSize] = useState<ComposerSize>('focused')
  const [annotationMode, setAnnotationMode] = useState(false)
  const [annotation, setAnnotation] = useState<ComponentAnnotation | null>(null)
  const [annotationCopyState, setAnnotationCopyState] = useState<'copied' | 'failed' | 'idle'>('idle')
  const [connection, setConnection] = useState<SidebarConnection>('connecting')
  const [customizerOpen, setCustomizerOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [draftCwd, setDraftCwd] = useState<string | null>(null)
  const [messageNumber, setMessageNumber] = useState(1)
  const [messagesByAgent, setMessagesByAgent] = useState<
    Readonly<Record<string, readonly ConversationMessage[]>>
  >({})
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState<SidebarWidth>('balanced')
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [workspace, setWorkspace] = useState<AgentWorkspace | null>(null)

  const applyWorkspace = useCallback((nextWorkspace: AgentWorkspace) => {
    setWorkspace(nextWorkspace)
    setConnection('ready')
    setSelectedSessionId(current => {
      if (
        current !== null &&
        nextWorkspace.sessions.some(session => session.activeSessionId === current)
      ) {
        return current
      }
      return nextWorkspace.sessions[0]?.activeSessionId ?? null
    })
  }, [])

  const reloadWorkspace = useCallback(async () => {
    const result = await loadAgentWorkspace()
    if (result.ok) {
      applyWorkspace(result.value)
      return
    }
    setConnection('unavailable')
    setSubmissionError(result.error.message)
  }, [applyWorkspace])

  useEffect(() => {
    let active = true
    void loadAgentWorkspace().then(result => {
      if (!active) return
      if (result.ok) {
        applyWorkspace(result.value)
        return
      }
      setConnection('unavailable')
      setSubmissionError(result.error.message)
    })
    return () => {
      active = false
    }
  }, [applyWorkspace])

  const selectedSession =
    workspace?.sessions.find(
      session => session.activeSessionId === selectedSessionId,
    ) ?? null
  const selectedMessages = selectedSession === null
    ? []
    : (messagesByAgent[selectedSession.activeSessionId] ?? [
        connectedMessage(selectedSession),
      ])

  const selectSession = useCallback((activeSessionId: string) => {
    'background only'
    setSelectedSessionId(activeSessionId)
    setDraftCwd(null)
    setDraft('')
    setSubmissionError(null)
  }, [])

  const toggleCustomizer = useCallback(() => {
    'background only'
    setCustomizerOpen(open => !open)
  }, [])

  const toggleAnnotationMode = useCallback(() => {
    'background only'
    setAnnotationMode(enabled => !enabled)
    setAnnotation(null)
    setAnnotationCopyState('idle')
  }, [])

  const selectAnnotation = useCallback((nextAnnotation: ComponentAnnotation) => {
    'background only'
    setAnnotation(nextAnnotation)
    setAnnotationCopyState('idle')
  }, [])

  const copyAnnotation = useCallback(() => {
    'background only'
    if (annotation === null) return
    void copyAnnotationContext(formatAnnotationContext(annotation)).then(result => {
      setAnnotationCopyState(result.ok ? 'copied' : 'failed')
    })
  }, [annotation])

  const startDraft = useCallback((cwd: string) => {
    'background only'
    setSelectedSessionId(null)
    setDraftCwd(cwd)
    setDraft('')
    setSubmissionError(null)
  }, [])

  const changeDraft = useCallback(
    (event: BaseEvent<'bindinput', InputInputEvent>) => {
      'background only'
      setDraft(event.detail.value)
    },
    [],
  )

  const submitMessage = useCallback(async (source: string) => {
    const message = source.trim()
    if (message.length === 0 || submitting || workspace === null) return

    setSubmitting(true)
    setSubmissionError(null)
    try {
      let target = selectedSession
      if (target === null) {
        const creation = await createAgentSession(draftCwd ?? workspace.currentCwd)
        if (!creation.ok) {
          setSubmissionError(creation.error.message)
          return
        }
        target = creation.value
        setSelectedSessionId(target.activeSessionId)
        setDraftCwd(null)
      }

      const queuedMessage: ConversationMessage = {
        id: `task-${messageNumber}`,
        role: 'user',
        text: message,
      }
      setMessagesByAgent(current => ({
        ...current,
        [target.activeSessionId]: [
          ...(current[target.activeSessionId] ?? [connectedMessage(target)]),
          queuedMessage,
        ],
      }))
      setMessageNumber(current => current + 1)
      setDraft('')

      const submission = await submitAgentTask(target.activeSessionId, message)
      if (!submission.ok) setSubmissionError(submission.error.message)
      await reloadWorkspace()
    } catch {
      setSubmissionError('Ernie could not reach the local daemon bridge.')
    } finally {
      setSubmitting(false)
    }
  }, [draftCwd, messageNumber, reloadWorkspace, selectedSession, submitting, workspace])

  const queueTask = useCallback(() => {
    'background only'
    void submitMessage(draft)
  }, [draft, submitMessage])

  const confirmTask = useCallback(
    (event: BaseEvent<'bindconfirm', InputConfirmEvent>) => {
      'background only'
      void submitMessage(event.detail.value)
    },
    [submitMessage],
  )

  const composerDisabled = workspace === null || submitting

  return (
    <view className='App'>
      <view className={`TitleBar TitleBar--${sidebarWidth}`}>
        <view className='ProductIdentity'>
          <view className='ProductMark'>
            <text className='ProductMarkText'>E</text>
          </view>
          <text className='ProductName'>{selectedSession?.name ?? 'New Agent'}</text>
        </view>
        <view className='TitleActions'>
          <view className='PrototypeStatus'>
            <view className={`PrototypeDot PrototypeDot--${connection}`} />
            <text className='PrototypeLabel'>
              Lynx v1 · {primeAgentHarness.name}
            </text>
          </view>
          <view
            accessibility-label='Annotate Lynx components'
            accessibility-role='button'
            bindtap={toggleAnnotationMode}
            className={`AnnotateButton ${annotationMode ? 'AnnotateButton--active' : ''}`}
          >
            <text className='AnnotateButtonText'>Annotate</text>
          </view>
          <view
            accessibility-label='Customize Ernie'
            accessibility-role='button'
            bindtap={toggleCustomizer}
            className={`CustomizeButton ${customizerOpen ? 'CustomizeButton--active' : ''}`}
          >
            <text className='CustomizeButtonText'>Customize</text>
          </view>
        </view>
      </view>

      {customizerOpen ? (
        <view className='Customizer'>
          <text className='CustomizerTitle'>Make Ernie yours</text>
          <view className='CustomizerGroup'>
            <text className='CustomizerLabel'>Sidebar</text>
            <view className='ChoiceRow'>
              {(['compact', 'balanced', 'wide'] as const).map(option => (
                <view
                  accessibility-label={`${option} sidebar`}
                  accessibility-role='button'
                  bindtap={() => {
                    'background only'
                    setSidebarWidth(option)
                  }}
                  className={`Choice ${sidebarWidth === option ? 'Choice--selected' : ''}`}
                  key={option}
                >
                  <text className='ChoiceText'>{option}</text>
                </view>
              ))}
            </view>
          </view>
          <view className='CustomizerGroup'>
            <text className='CustomizerLabel'>Task input</text>
            <view className='ChoiceRow'>
              {(['focused', 'roomy'] as const).map(option => (
                <view
                  accessibility-label={`${option} task input`}
                  accessibility-role='button'
                  bindtap={() => {
                    'background only'
                    setComposerSize(option)
                  }}
                  className={`Choice ${composerSize === option ? 'Choice--selected' : ''}`}
                  key={option}
                >
                  <text className='ChoiceText'>{option}</text>
                </view>
              ))}
            </view>
          </view>
        </view>
      ) : null}

      <view className='Workspace'>
        <AgentSidebar
          annotationMode={annotationMode}
          connection={connection}
          currentCwd={workspace?.currentCwd ?? null}
          onAnnotate={selectAnnotation}
          onOpenSettings={toggleCustomizer}
          onSelect={selectSession}
          onStartDraft={startDraft}
          selectedAnnotationId={annotation?.id ?? null}
          selectedSessionId={selectedSessionId}
          sessions={workspace?.sessions ?? []}
          width={sidebarWidth}
        />

        <view
          catchtap={annotationMode ? () => {
            'background only'
            selectAnnotation({
              component: 'App',
              id: 'agent-detail',
              label: 'Conversation surface',
              source: 'lynx/src/app.tsx',
            })
          } : undefined}
          className={`AgentDetail ${annotationMode ? 'AnnotationTarget' : ''} ${annotation?.id === 'agent-detail' ? 'AnnotationTarget--selected' : ''}`}
        >
          {selectedSession === null ? (
            <view className='EmptyDetail'>
              <text className='DetailTitle'>Start a live Agent</text>
              <text className='DetailObjective'>
                Send the first task to create a Prime Agent session in this workspace.
              </text>
            </view>
          ) : (
            <>
              <view className='DetailHeader'>
                <view className='DetailHeading'>
                  <text className='DetailTitle'>{selectedSession.name}</text>
                  <text className={`Activity Activity--${selectedSession.activity}`}>
                    {activityLabels[selectedSession.activity]}
                  </text>
                </view>
                <text className='DetailObjective'>{selectedSession.cwd}</text>
                <view className='Metadata'>
                  <text className='MetadataValue'>{primeAgentHarness.name}</text>
                  <text className='MetadataDivider'>·</text>
                  <text className='MetadataValue'>live daemon</text>
                </view>
              </view>

              <scroll-view className='Conversation' scroll-y>
                {selectedMessages.map(message => (
                  <view
                    className={`Message Message--${message.role}`}
                    key={message.id}
                  >
                    <text className='MessageRole'>
                      {message.role === 'user' ? 'You' : 'Ernie'}
                    </text>
                    <text className='MessageText'>{message.text}</text>
                  </view>
                ))}
              </scroll-view>
            </>
          )}

          <view
            catchtap={annotationMode ? () => {
              'background only'
              selectAnnotation({
                component: 'App',
                id: 'task-composer',
                label: 'Task composer',
                source: 'lynx/src/app.tsx',
              })
            } : undefined}
            className={`Composer Composer--${composerSize} ${annotationMode ? 'AnnotationTarget' : ''} ${annotation?.id === 'task-composer' ? 'AnnotationTarget--selected' : ''}`}
          >
            <input
              accessibility-label='Give Ernie a task'
              bindconfirm={confirmTask}
              bindinput={changeDraft}
              className='TaskInput'
              confirm-type='send'
              key={`${selectedSessionId ?? 'new'}-${messageNumber}`}
              maxlength={500}
              placeholder={composerDisabled ? 'Connecting to daemon…' : 'Give Ernie a task…'}
              type='text'
            />
            <view
              accessibility-label='Send task to Prime Agent'
              accessibility-role='button'
              bindtap={queueTask}
              className={`SendButton ${draft.trim().length === 0 || composerDisabled ? 'SendButton--disabled' : ''}`}
            >
              <text className='SendButtonText'>{submitting ? 'Sending' : 'Send'}</text>
            </view>
          </view>
          {submissionError === null ? null : (
            <text className='ComposerError'>{submissionError}</text>
          )}
          <text className='ComposerNote'>Live v1 · local daemon bridge</text>
        </view>
      </view>
      {annotationMode ? (
        <view className='AnnotationPanel'>
          <view className='AnnotationPanelHeader'>
            <text className='AnnotationPanelTitle'>Lynx component annotation</text>
            <text className='AnnotationPanelHint'>tap an outlined region</text>
          </view>
          {annotation === null ? (
            <text className='AnnotationEmpty'>No component selected</text>
          ) : (
            <>
              <text className='AnnotationComponent'>{annotation.component}</text>
              <text className='AnnotationLabel'>{annotation.label}</text>
              <text className='AnnotationSource'>{annotation.source}</text>
              <view
                accessibility-label='Copy component context'
                accessibility-role='button'
                bindtap={copyAnnotation}
                className='AnnotationCopyButton'
              >
                <text className='AnnotationCopyButtonText'>
                  {annotationCopyState === 'copied'
                    ? 'Copied'
                    : annotationCopyState === 'failed'
                      ? 'Copy failed'
                      : 'Copy agent context'}
                </text>
              </view>
            </>
          )}
        </view>
      ) : null}
    </view>
  )
}
