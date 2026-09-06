import * as stylex from "@stylexjs/stylex"
import { Collapsible } from "@base-ui/react/collapsible"
import { Effect } from "effect"
import { useEffect, useId, useRef, useState } from "react"
import { FolderIcon, ShuffleIcon, XIcon } from "lucide-react"
import { type Agent, type AgentSettings } from "../../packages/agents"
import { randomAgentFirstName } from "../../packages/agents/names"
import { useAgents } from "../agent-state"
import { usePrimeSessionState, usePrimeSessionSelection, useWorkspacePath } from "../prime-agent-state"
import { AgentAvatar } from "./agent-avatar"
import { useAgentCreation, type AgentSection } from "../agent-creation"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Textarea } from "./ui/textarea"
import { getWorkspaceName } from "./workspace-name"
import { styles } from "./agent-settings.styles"
import { styles as rosterStyles } from "./agent-roster.styles"

function createCharacters(): Agent["avatar"][] {
  return Array.from(crypto.getRandomValues(new Uint32Array(12)), (seed) => ({ kind: "generated", seed }))
}
function avatarKey(avatar: Agent["avatar"]): string {
  return typeof avatar === "string" ? avatar : `generated:${avatar.seed}`
}

const introductions = [
  (name: string) => `Hi, I’m ${name}! What little adventure shall we work on?`,
  (name: string) => `Hello there, I’m ${name}. Got a big idea or a tiny tangle for me?`,
  (name: string) => `Psst… I’m ${name}! What shall we dream up together?`,
  (name: string) => `I’m ${name}, your curious little sidekick. What can I help with?`,
]

/** Creation and refinement share one inline form. */
export function AgentSettingsDialog({ agent, onClose, section = "Customize" }: { agent?: Agent; onClose: () => void; section?: AgentSection }) {
  const { roster, client, execute } = useAgents()
  const workspace = useWorkspacePath()
  const sessions = usePrimeSessionState()
  const { selectedSessionId } = usePrimeSessionSelection()
  const currentWorkspace = sessions.data.find((session) => session.id === selectedSessionId)?.cwd
    ?? roster.agents.find((item) => item.id === roster.selectedAgentId)?.cwd ?? workspace.data ?? ""
  const [id] = useState(() => agent?.id ?? crypto.randomUUID())
  const [expectedNativeName] = useState(agent?.name)
  const [expectedRevision] = useState(() => agent?.revision ?? 0)
  const [characters, setCharacters] = useState(() => agent ? [agent.avatar, ...createCharacters().slice(1)] : createCharacters())
  const [settings, setSettings] = useState<AgentSettings>(() => agent ?? { name: Effect.runSync(randomAgentFirstName), avatar: characters[0] ?? "fern", role: "", instructions: "", cwd: currentWorkspace, provider: "", model: "" })
  const [creationPanel, setPanel] = useState<AgentSection | null>(null)
  const panel = agent ? section : creationPanel
  const lastPanel = useRef<AgentSection>("Customize")
  if (panel) lastPanel.current = panel
  const displayedPanel = panel ?? lastPanel.current
  const disclosureId = useId()
  const [greetingIndex] = useState(() => crypto.getRandomValues(new Uint32Array(1))[0]! % introductions.length)
  const greeting = introductions[greetingIndex]!(settings.name.trim() || "your new Agent")
  const [saving, setSaving] = useState(false)
  const [choosingFolder, setChoosingFolder] = useState(false)
  const [error, setError] = useState<string>()
  const nameRef = useRef<HTMLInputElement>(null)
  const folder = settings.cwd || currentWorkspace
  const update = <K extends keyof AgentSettings>(key: K, value: AgentSettings[K]) => setSettings((current) => ({ ...current, [key]: value }))
  return <section aria-label={agent ? `Edit ${agent.name}` : "Create Agent"} {...stylex.props(agent ? styles.inlinePanel : styles.creationComposer)}>
      <button type="button" aria-label="Close Agent settings" disabled={saving || choosingFolder} onClick={onClose} {...stylex.props(styles.cancel, styles.keyboard)}><XIcon size={16}/></button>
      <form onSubmit={(event) => {
        event.preventDefault()
        if (saving || choosingFolder) return
        if (!folder) { setError("Choose a folder for your Agent first."); return }
        setSaving(true)
        setError(undefined)
        void execute(() => client.save({ ...settings, instructions: agent ? settings.instructions : [settings.role.trim(), settings.instructions.trim()].filter(Boolean).join("\n\n"), cwd: folder, id, expectedRevision, expectedNativeName })).then(async (result) => {
          if (result.ok && !agent) {
            const selection = await execute(() => client.select({ agentId: result.value.id }))
            if (!selection.ok) { setSaving(false); setError("Your Agent is saved. Try again to open their conversation."); return }
          }
          setSaving(false)
          if (result.ok) onClose()
          else setError(result.error)
        })
      }}>
        <fieldset disabled={saving || choosingFolder} {...stylex.props(styles.fields, !agent && styles.composerFields)}>
          <legend {...stylex.props(rosterStyles.hidden)}>Your Agent</legend>
          {!agent ? <Textarea aria-label="What would you like help with?" autoFocus xstyle={styles.composerInput} rows={3} maxLength={200} placeholder={greeting} value={settings.role} onChange={(event) => update("role", event.target.value)}/> : null}
          {!agent ? <div {...stylex.props(styles.panelTabs)}>
            {(["Customize", "Refine", "Folder"] as const).map((item) => <button key={item} type="button" aria-controls={disclosureId} aria-expanded={panel === item} onClick={() => setPanel(panel === item ? null : item)} {...stylex.props(styles.shuffle, styles.keyboard)}>{item === "Customize" ? <AgentAvatar avatar={settings.avatar} animated/> : null}{item === "Customize" ? `${settings.name} · Customize` : item}</button>)}
          </div> : null}
          <Collapsible.Root open={panel !== null} {...stylex.props(styles.fullWidth)}><Collapsible.Panel id={disclosureId} {...stylex.props(styles.reveal)}><div key={displayedPanel} {...stylex.props(styles.revealContent)}>
          {displayedPanel === "Customize" ? <div {...stylex.props(styles.fields, styles.fullWidth)}>
          <div {...stylex.props(styles.identity)}>
            <span {...stylex.props(styles.portrait)}><AgentAvatar avatar={settings.avatar} size="large" animated/></span>
            <label {...stylex.props(styles.nameLabel)}>What should we call them?
              <Input ref={nameRef} xstyle={styles.name} name="agentName" autoComplete="off" required maxLength={100} placeholder="A name of their own" value={settings.name} onChange={(event) => update("name", event.target.value)}/>
            </label>
          </div>
          <div>
            <div {...stylex.props(styles.galleryHeading)}><span>Pick a little personality</span><button type="button" {...stylex.props(styles.shuffle, styles.keyboard)} onClick={() => setCharacters([settings.avatar, ...createCharacters().slice(1)])}><ShuffleIcon {...stylex.props(styles.icon)}/>More faces</button></div>
            <div {...stylex.props(styles.gallery)} role="group" aria-label="Choose a character">
              {characters.map((avatar, index) => <button key={avatarKey(avatar)} type="button" {...stylex.props(styles.character, styles.keyboard, avatarKey(settings.avatar) === avatarKey(avatar) && styles.selected)} aria-label={`Character ${index + 1}`} aria-pressed={avatarKey(settings.avatar) === avatarKey(avatar)} onClick={() => update("avatar", avatar)}><AgentAvatar avatar={avatar} animated/></button>)}
            </div>
          </div>
          </div> : null}
          {displayedPanel === "Refine" ? <div {...stylex.props(styles.fields, styles.fullWidth)}>
            <label {...stylex.props(styles.label)}>How should your Agent work?
              <Textarea aria-label="How your Agent should work" readOnly={Boolean(agent?.root)} xstyle={styles.notes} rows={3} placeholder="How you like to work, what matters to you, things to keep in mind…" value={settings.instructions} onChange={(event) => update("instructions", event.target.value)}/>
            </label>
            {agent?.root ? <p {...stylex.props(styles.description)}>These instructions belong to the saved root. Changing them during a session is not supported yet.</p> : null}
          </div> : null}
          {displayedPanel === "Folder" ? <div {...stylex.props(styles.fullWidth)}>
          <div {...stylex.props(styles.workspace)}>
            <FolderIcon {...stylex.props(styles.icon)}/><div {...stylex.props(styles.folder)}><span>Folder your Agent works in</span><span title={folder} {...stylex.props(styles.folderName)}>{folder ? getWorkspaceName(folder) : "Choose a folder"}</span></div>
            <button type="button" disabled={Boolean(agent?.root)} {...stylex.props(styles.changeFolder)} onClick={() => {
              setChoosingFolder(true)
              setError(undefined)
              void execute(() => client.chooseWorkspace()).then((result) => {
                setChoosingFolder(false)
                if (result.ok) { if (result.value) update("cwd", result.value) }
                else setError(result.error)
              })
            }}>{choosingFolder ? "Choosing…" : "Change folder"}</button>
          </div>
          {agent?.root ? <p {...stylex.props(styles.description)}>This is the native root’s working folder. Live folder changes are not supported yet.</p> : null}
          </div> : null}
          </div></Collapsible.Panel></Collapsible.Root>
          {error ? <p role="alert" {...stylex.props(styles.error)}>{error}</p> : null}
          <div {...stylex.props(styles.actions)}><Button variant={agent ? "secondary" : "default"} xstyle={agent ? styles.save : styles.submit} type="submit">{saving ? "Saving…" : agent ? "Save changes" : settings.name.trim() ? `Bring ${settings.name.trim()} to life` : "Create Agent"}</Button></div>
        </fieldset>
      </form>
  </section>
}

/** A single inline panel keeps refinement beside the root’s composer and preserves its draft. */
export function AgentControls({ agent, showTabs = true }: { agent: Agent; showTabs?: boolean }) {
  const { editing, setEditing } = useAgentCreation()
  const panelId = useId()
  const open = editing?.agentId === agent.id
  const lastSection = useRef<AgentSection>("Customize")
  useEffect(() => { if (open) lastSection.current = editing.section }, [open, editing])
  const trigger = useRef<HTMLButtonElement | null>(null)
  return <div {...stylex.props(styles.controls)}>
    {showTabs || open ? <div {...stylex.props(styles.panelTabs)}>{(["Customize", "Refine", "Folder"] as const).map((section) => <button key={section} type="button" aria-controls={open ? panelId : undefined} aria-expanded={open && editing.section === section} {...stylex.props(styles.sectionButton, styles.keyboard, open && editing.section === section && styles.sectionActive)} onClick={(event) => { trigger.current = event.currentTarget; setEditing(open && editing.section === section ? null : { agentId: agent.id, section }) }}>{section}</button>)}</div> : null}
    <Collapsible.Root open={open}><Collapsible.Panel id={panelId} {...stylex.props(styles.settingsReveal)}><AgentSettingsDialog key={agent.id} agent={agent} section={open ? editing.section : lastSection.current} onClose={() => { setEditing(null); trigger.current?.focus() }}/></Collapsible.Panel></Collapsible.Root>
  </div>
}
