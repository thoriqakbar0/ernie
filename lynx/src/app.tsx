import { useInitData } from '@lynx-js/react'

import './app.css'
import { parseDaemonRoster } from './daemon-roster.js'

/** Receive Prime Agent roster updates without rendering product UI. */
export function App() {
  const roster = parseDaemonRoster(useInitData().daemonRoster)
  const agentCount = roster?.activeAgents.length ?? 0
  const connection = roster?.connection ?? 'unavailable'

  return (
    <view
      accessibility-label={`Prime Agent ${connection}; ${agentCount} active agents received`}
      className={`DaemonReceiver DaemonReceiver--${connection}`}
    />
  )
}
