import { useInitData } from '@lynx-js/react'

import './app.css'
import { AgentSidebar } from './agent-sidebar.js'
import { parseDaemonRoster } from './daemon-roster.js'

/** Receive Prime Agent roster updates and render the first sidebar data slice. */
export function App() {
  const roster = parseDaemonRoster(useInitData().daemonRoster)

  return (
    <view className='App'>
      <AgentSidebar roster={roster} />
      <view className='WorkspaceCanvas' />
    </view>
  )
}
