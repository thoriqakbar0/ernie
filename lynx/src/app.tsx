import { useInitData, useState } from '@lynx-js/react'

import './app.css'
import { AgentSidebar } from './agent-sidebar.js'
import { parseDaemonRoster } from './daemon-roster.js'

/** Receive Prime Agent roster updates and render the first sidebar data slice. */
export function App() {
  const roster = parseDaemonRoster(useInitData().daemonRoster)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)

  return (
    <view className='App'>
      <AgentSidebar
        onSelectAgent={setSelectedAgentId}
        roster={roster}
        selectedAgentId={selectedAgentId}
      />
      <view className='WorkspaceCanvas' />
    </view>
  )
}
