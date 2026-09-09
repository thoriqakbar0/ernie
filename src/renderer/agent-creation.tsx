import type { AgentSettings } from "../packages/agents"
import { createContext, useContext, useMemo, useState } from "react"
import type { ReactNode } from "react"

export type AgentSection = "Customize" | "Folder"
type Editing = { agentId: string; section: AgentSection; focusName?: boolean } | null
const AgentCreationContext = createContext<{
  continuation: AgentSettings | null
  beginInFolder: (settings: AgentSettings) => void
  editing: Editing
  setEditing: (editing: Editing) => void
  adding: boolean
  setAdding: (adding: boolean) => void
  draftSettingsHost: HTMLDivElement | null
  setDraftSettingsHost: (host: HTMLDivElement | null) => void
  draftSettingsDocked: boolean
  setDraftSettingsDocked: (docked: boolean) => void
} | null>(null)
export const AgentCreationProvider = ({ children }: { children: ReactNode }) => {
  const [editing, setEditing] = useState<Editing>(null)
  const [adding, updateAdding] = useState(false)
  const [continuation, setContinuation] = useState<AgentSettings | null>(null)
  const [draftSettingsHost, setDraftSettingsHost] = useState<HTMLDivElement | null>(null)
  const [draftSettingsDocked, setDraftSettingsDocked] = useState(false)
  const value = useMemo(
    () => ({
      adding,
      draftSettingsDocked,
      draftSettingsHost,
      editing,
      continuation,
      beginInFolder: (settings: AgentSettings) => {
        setContinuation(settings)
        setEditing(null)
        updateAdding(true)
      },
      setAdding: (next: boolean) => {
        setContinuation(null)
        updateAdding(next)
      },
      setDraftSettingsDocked,
      setDraftSettingsHost,
      setEditing,
    }),
    [adding, continuation, draftSettingsDocked, draftSettingsHost, editing],
  )
  return <AgentCreationContext value={value}>{children}</AgentCreationContext>
}
export const useAgentCreation = () => {
  const context = useContext(AgentCreationContext)
  if (!context) {
    throw new Error("AgentCreationProvider is missing")
  }
  return context
}
