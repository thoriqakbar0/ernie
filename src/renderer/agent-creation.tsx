import { createContext, useContext, useMemo, useState } from "react"
import type { ReactNode } from "react"

export type AgentSection = "Customize" | "Folder"
type Editing = { agentId: string; section: AgentSection } | null
const AgentCreationContext = createContext<{
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
  const [adding, setAdding] = useState(false)
  const [draftSettingsHost, setDraftSettingsHost] = useState<HTMLDivElement | null>(null)
  const [draftSettingsDocked, setDraftSettingsDocked] = useState(false)
  const value = useMemo(
    () => ({
      adding,
      draftSettingsDocked,
      draftSettingsHost,
      editing,
      setAdding,
      setDraftSettingsDocked,
      setDraftSettingsHost,
      setEditing,
    }),
    [adding, draftSettingsDocked, draftSettingsHost, editing],
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
