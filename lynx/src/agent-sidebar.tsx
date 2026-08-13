import type { ActiveAgent, AgentActivity, DaemonRoster } from './daemon-roster.js'

interface AgentSidebarProps {
  readonly onSelectAgent: (activeSessionId: string) => void
  readonly roster: DaemonRoster | null
  readonly selectedAgentId: string | null
}

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

function folderName(cwd: string): string {
  const segments = cwd.split(/[\\/]/u).filter(Boolean)
  return segments.length === 0 ? cwd : (segments[segments.length - 1] ?? cwd)
}

function orderAgents(agents: readonly ActiveAgent[]): readonly ActiveAgent[] {
  return agents
    .map((agent, index) => ({ agent, index }))
    .sort((left, right) =>
      activityOrder[left.agent.activity] - activityOrder[right.agent.activity] ||
      left.index - right.index)
    .map(({ agent }) => agent)
}

/** Show the active Prime Agent roster received from the Node host. */
export function AgentSidebar({
  onSelectAgent,
  roster,
  selectedAgentId,
}: AgentSidebarProps) {
  const activeAgents = orderAgents(roster?.activeAgents ?? [])
  const connection = roster?.connection ?? 'unavailable'
  const currentCwd = roster?.currentCwd ?? ''
  const workingCount = activeAgents.filter(agent => agent.activity === 'working').length
  const needsInputCount = activeAgents.filter(
    agent => agent.activity === 'needs_input',
  ).length
  const needsInputSummary = `${needsInputCount} input`
  const workingSummary = `${workingCount} working`

  return (
    <view className='AgentSidebar'>
      <view className='SidebarHeader'>
        <view className='SidebarTitleRow'>
          <text className='SidebarTitle'>Agents</text>
          <view className={`ConnectionDot ConnectionDot--${connection}`} />
        </view>
        <view className='RepositoryRow'>
          <text className='Disclosure'>⌄</text>
          <text className='RepositoryName'>
            {currentCwd.length === 0 ? 'Prime Agent' : folderName(currentCwd)}
          </text>
          <view className='RepositorySummary'>
            {needsInputCount > 0 ? (
              <text className='SummaryText SummaryText--attention'>
                {needsInputSummary}
              </text>
            ) : null}
            {workingCount > 0 ? (
              <text className='SummaryText'>{workingSummary}</text>
            ) : null}
          </view>
        </view>
      </view>

      <view className='AgentList'>
        <view className='AgentListContent'>
          {activeAgents.length === 0 ? (
            <view className='EmptyRoster'>
              <text className='EmptyRosterText'>
                {connection === 'ready' ? 'No active agents' : 'Prime Agent unavailable'}
              </text>
            </view>
          ) : activeAgents.map((agent, index) => {
            const activityLabel = activityLabels[agent.activity]
            const selected = agent.activeSessionId === selectedAgentId
            return (
              <view
                accessibility-element={true}
                accessibility-label={`${agent.name}, ${activityLabel ?? agent.activity}${selected ? ', selected' : ''}`}
                accessibility-traits={selected ? 'selected' : 'button'}
                bindfocus={() => onSelectAgent(agent.activeSessionId)}
                bindtap={() => onSelectAgent(agent.activeSessionId)}
                className={`AgentRow AgentRow--${agent.activity} ${selected ? 'AgentRow--selected' : ''}`}
                focus-index={`0, ${index}`}
                focusable={true}
                key={agent.activeSessionId}
              >
                <view className={`ActivityMark ActivityMark--${agent.activity}`} />
                <text className='AgentName'>{agent.name}</text>
                {activityLabel === null ? null : (
                  <text className={`ActivityLabel ActivityLabel--${agent.activity}`}>
                    {activityLabel}
                  </text>
                )}
              </view>
            )
          })}
        </view>
      </view>

      <view className='SidebarFooter'>
        <text className='FooterLabel'>Prime Agent</text>
        <text className='FooterCount'>{activeAgents.length}</text>
      </view>
    </view>
  )
}
