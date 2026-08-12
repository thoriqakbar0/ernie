import { useCallback, useState } from '@lynx-js/react'
import type { BaseEvent, InputConfirmEvent, InputInputEvent } from '@lynx-js/types'

import './app.css'
import { primeAgentHarness } from './daemon-contract.js'

type AgentActivity = 'needs-input' | 'settled' | 'working'
type AgentId = 'accessibility-review' | 'feasibility' | 'lynx-port'
type ComposerSize = 'focused' | 'roomy'
type SidebarWidth = 'balanced' | 'compact' | 'wide'

type ConversationMessage = Readonly<{
  id: string
  role: 'assistant' | 'user'
  text: string
}>

type AgentSummary = Readonly<{
  activity: AgentActivity
  branch: string
  id: AgentId
  name: string
  objective: string
  update: string
  workspace: string
}>

const agents = [
  {
    activity: 'working',
    branch: 't3code/research-lynx-port',
    id: 'lynx-port',
    name: 'Port Ernie to Lynx',
    objective: 'Rebuild the Agent workspace without React DOM dependencies.',
    update: 'Creating the first ReactLynx v1.',
    workspace: 'ernie',
  },
  {
    activity: 'needs-input',
    branch: 'main',
    id: 'accessibility-review',
    name: 'Review accessibility',
    objective: 'Confirm keyboard, focus, and screen-reader behavior on macOS.',
    update: 'Waiting for a native-host accessibility test.',
    workspace: 'ernie',
  },
  {
    activity: 'settled',
    branch: 'main',
    id: 'feasibility',
    name: 'Research Lynx feasibility',
    objective: 'Map Ernie boundaries onto the current Lynx desktop runtime.',
    update: 'Research note completed and signed off.',
    workspace: 'ernie',
  },
] as const satisfies readonly AgentSummary[]

const initialMessages = {
  'accessibility-review': [
    {
      id: 'accessibility-task',
      role: 'user',
      text: 'Review the port for keyboard and screen-reader gaps.',
    },
    {
      id: 'accessibility-reply',
      role: 'assistant',
      text: 'The component semantics are ready. Native macOS verification still needs the Lynx host.',
    },
  ],
  feasibility: [
    {
      id: 'feasibility-task',
      role: 'user',
      text: 'Can Ernie move to Lynx without rebuilding everything?',
    },
    {
      id: 'feasibility-reply',
      role: 'assistant',
      text: 'The product can target Lynx, but the React DOM renderer and Electron host need separate migration paths.',
    },
  ],
  'lynx-port': [
    {
      id: 'lynx-task',
      role: 'user',
      text: 'Start the Lynx port as a customizable v1.',
    },
    {
      id: 'lynx-reply',
      role: 'assistant',
      text: 'The roster, conversation, task input, and jellyware controls now live in one ReactLynx bundle.',
    },
  ],
} as const satisfies Readonly<Record<AgentId, readonly ConversationMessage[]>>

const activityLabels = {
  'needs-input': 'Needs input',
  settled: 'Settled',
  working: 'Working',
} as const satisfies Readonly<Record<AgentActivity, string>>

type AgentRowProps = Readonly<{
  agent: AgentSummary
  onSelect: (agentId: AgentId) => void
  selected: boolean
}>

function AgentRow({ agent, onSelect, selected }: AgentRowProps) {
  const selectAgent = useCallback(() => {
    'background only'
    onSelect(agent.id)
  }, [agent.id, onSelect])

  return (
    <view
      accessibility-label={`${agent.name}, ${activityLabels[agent.activity]}`}
      accessibility-role='button'
      bindtap={selectAgent}
      className={`AgentRow ${selected ? 'AgentRow--selected' : ''}`}
    >
      <view className={`StatusDot StatusDot--${agent.activity}`} />
      <view className='AgentRowContent'>
        <text className='AgentName'>{agent.name}</text>
        <text className='AgentObjective'>{agent.objective}</text>
        <view className='AgentMeta'>
          <text className='WorkspaceName'>{agent.workspace}</text>
          <text className={`Activity Activity--${agent.activity}`}>
            {activityLabels[agent.activity]}
          </text>
        </view>
      </view>
    </view>
  )
}

/** Render Ernie's customizable ReactLynx v1 with a local conversation loop. */
export function App() {
  const [composerSize, setComposerSize] = useState<ComposerSize>('focused')
  const [customizerOpen, setCustomizerOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [messageNumber, setMessageNumber] = useState(1)
  const [messagesByAgent, setMessagesByAgent] = useState<
    Readonly<Record<AgentId, readonly ConversationMessage[]>>
  >(initialMessages)
  const [selectedAgentId, setSelectedAgentId] = useState<AgentId>('lynx-port')
  const [sidebarWidth, setSidebarWidth] = useState<SidebarWidth>('balanced')
  const selectedAgent =
    agents.find(agent => agent.id === selectedAgentId) ?? agents[0]
  const selectedMessages = messagesByAgent[selectedAgent.id]

  const selectAgent = useCallback((agentId: AgentId) => {
    'background only'
    setSelectedAgentId(agentId)
    setDraft('')
  }, [])

  const toggleCustomizer = useCallback(() => {
    'background only'
    setCustomizerOpen(open => !open)
  }, [])

  const changeDraft = useCallback(
    (event: BaseEvent<'bindinput', InputInputEvent>) => {
      'background only'
      setDraft(event.detail.value)
    },
    [],
  )

  const queueTask = useCallback(() => {
    'background only'
    const message = draft.trim()
    if (message.length === 0) return

    const queuedMessage: ConversationMessage = {
      id: `local-task-${messageNumber}`,
      role: 'user',
      text: message,
    }
    setMessagesByAgent(current => ({
      ...current,
      [selectedAgent.id]: [...current[selectedAgent.id], queuedMessage],
    }))
    setMessageNumber(current => current + 1)
    setDraft('')
  }, [draft, messageNumber, selectedAgent.id])

  const confirmTask = useCallback(
    (event: BaseEvent<'bindconfirm', InputConfirmEvent>) => {
      'background only'
      const message = event.detail.value.trim()
      if (message.length === 0) return

      const queuedMessage: ConversationMessage = {
        id: `local-task-${messageNumber}`,
        role: 'user',
        text: message,
      }
      setMessagesByAgent(current => ({
        ...current,
        [selectedAgent.id]: [...current[selectedAgent.id], queuedMessage],
      }))
      setMessageNumber(current => current + 1)
      setDraft('')
    },
    [messageNumber, selectedAgent.id],
  )

  return (
    <view className='App'>
      <view className='TitleBar'>
        <view className='ProductIdentity'>
          <view className='ProductMark'>
            <text className='ProductMarkText'>E</text>
          </view>
          <text className='ProductName'>Ernie + Lynx</text>
        </view>
        <view className='TitleActions'>
          <view className='PrototypeStatus'>
            <view className='PrototypeDot' />
            <text className='PrototypeLabel'>
              Lynx v1 · {primeAgentHarness.name}
            </text>
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
        <view className={`Roster Roster--${sidebarWidth}`}>
          <view className='SectionHeader'>
            <text className='SectionTitle'>Agents</text>
            <text className='SectionCount'>3</text>
          </view>
          <scroll-view className='AgentList' scroll-y>
            {agents.map(agent => (
              <AgentRow
                agent={agent}
                key={agent.id}
                onSelect={selectAgent}
                selected={agent.id === selectedAgent.id}
              />
            ))}
          </scroll-view>
        </view>

        <view className='AgentDetail'>
          <view className='DetailHeader'>
            <view className='DetailHeading'>
              <text className='DetailTitle'>{selectedAgent.name}</text>
              <text className={`Activity Activity--${selectedAgent.activity}`}>
                {activityLabels[selectedAgent.activity]}
              </text>
            </view>
            <text className='DetailObjective'>{selectedAgent.objective}</text>
            <view className='Metadata'>
              <text className='MetadataValue'>{selectedAgent.workspace}</text>
              <text className='MetadataDivider'>·</text>
              <text className='MetadataValue'>{selectedAgent.branch}</text>
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
            <view className='LatestUpdate'>
              <text className='UpdateTitle'>Latest update</text>
              <text className='UpdateBody'>{selectedAgent.update}</text>
            </view>
          </scroll-view>

          <view className={`Composer Composer--${composerSize}`}>
            <input
              accessibility-label='Give Ernie a task'
              bindconfirm={confirmTask}
              bindinput={changeDraft}
              className='TaskInput'
              confirm-type='send'
              key={`${selectedAgent.id}-${messageNumber}`}
              maxlength={500}
              placeholder='Give Ernie a task…'
              type='text'
            />
            <view
              accessibility-label='Queue task'
              accessibility-role='button'
              bindtap={queueTask}
              className={`SendButton ${draft.trim().length === 0 ? 'SendButton--disabled' : ''}`}
            >
              <text className='SendButtonText'>Send</text>
            </view>
          </view>
          <text className='ComposerNote'>Local v1 · host bridge comes next</text>
        </view>
      </view>
    </view>
  )
}
