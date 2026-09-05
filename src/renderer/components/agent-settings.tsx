import * as stylex from "@stylexjs/stylex"
import { styles as rosterStyles } from "./agent-roster.styles"
import { useState } from "react"
import { type Agent, type AgentSettings, Avatar } from "../../packages/agents"
import { useAgents } from "../agent-state"
import { useWorkspacePath } from "../prime-agent-state"
import { AgentAvatar, avatarNames } from "./agent-avatar"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Textarea } from "./ui/textarea"

/** Editable identity and future-conversation defaults; failure keeps every field. */
export function AgentSettingsDialog({ agent, onClose }: { agent?: Agent; onClose: () => void }) {
  const { client, execute } = useAgents()
  const workspace = useWorkspacePath()
  const [id] = useState(() => agent?.id ?? crypto.randomUUID())
  const [expectedRevision] = useState(() => agent?.revision ?? 0)
  const [settings, setSettings] = useState<AgentSettings>(() => agent ?? { name: "", avatar: "fern", role: "", instructions: "", cwd: workspace.data ?? "", provider: "", model: "" })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const update = <K extends keyof AgentSettings>(key: K, value: AgentSettings[K]) => setSettings((current) => ({ ...current, [key]: value }))
  return <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose() }}>
    <DialogContent xstyle={rosterStyles.settings}>
      <DialogTitle>{agent ? "Edit Agent" : "Add Agent"}</DialogTitle>
      <DialogDescription>Give your Agent a role. Instructions and defaults apply to new conversations.</DialogDescription>
      <form onSubmit={(event) => {
        event.preventDefault()
        if (saving) return
        setSaving(true)
        void execute(() => client.save({ ...settings, id, expectedRevision })).then((result) => {
          setSaving(false)
          if (result.ok) onClose()
          else setError(result.error)
        })
      }}>
        <fieldset disabled={saving} {...stylex.props(rosterStyles.fields)}>
          <legend {...stylex.props(rosterStyles.hidden)}>Agent settings</legend>
          <div {...stylex.props(rosterStyles.choices)} role="group" aria-label="Avatar">
            {Avatar.literals.map((avatar) => <button key={avatar} type="button" {...stylex.props(rosterStyles.choice, settings.avatar === avatar && rosterStyles.choiceSelected)} aria-label={`${avatarNames[avatar]} avatar`} aria-pressed={settings.avatar === avatar} onClick={() => update("avatar", avatar)}><AgentAvatar avatar={avatar}/></button>)}
          </div>
          <label {...stylex.props(rosterStyles.label)}>Name<Input required maxLength={100} value={settings.name} onChange={(event) => update("name", event.target.value)} /></label>
          <label {...stylex.props(rosterStyles.label)}>Role<Input maxLength={200} placeholder="What this Agent helps with" value={settings.role} onChange={(event) => update("role", event.target.value)} /></label>
          <label {...stylex.props(rosterStyles.label)}>Instructions<Textarea rows={4} value={settings.instructions} onChange={(event) => update("instructions", event.target.value)} /></label>
          <label {...stylex.props(rosterStyles.label)}>Default workspace<Input required placeholder="/absolute/path/to/workspace" value={settings.cwd} onChange={(event) => update("cwd", event.target.value)} /></label>
          <div {...stylex.props(rosterStyles.modelFields)}>
            <label {...stylex.props(rosterStyles.label)}>Model provider<Input placeholder="Use runtime default" value={settings.provider} onChange={(event) => update("provider", event.target.value)} /></label>
            <label {...stylex.props(rosterStyles.label)}>Model ID<Input placeholder="Use runtime default" value={settings.model} onChange={(event) => update("model", event.target.value)} /></label>
          </div>
          <p {...stylex.props(rosterStyles.hint)}>Leave both model fields empty to use Prime Agent’s default.</p>
          {error ? <p role="alert" {...stylex.props(rosterStyles.feedback)}>{error}</p> : null}
          <Button type="submit">{saving ? "Saving…" : "Save Agent"}</Button>
        </fieldset>
      </form>
    </DialogContent>
  </Dialog>
}
