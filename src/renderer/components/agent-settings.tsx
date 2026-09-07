import { DraftModelPicker } from "./draft-model-picker"
import { AnimatedTabs } from "./ui/animated-tabs"
import * as stylex from "@stylexjs/stylex"
import { DraftAgentSettingsPanel } from "./draft-agent-settings-panel"
import { Tabs } from "@base-ui/react/tabs"
import { Effect } from "effect"
import { useEffect, useId, useRef, useState } from "react"
import { FolderIcon, ShuffleIcon, XIcon } from "lucide-react"
import { type Agent, type AgentSettings } from "../../packages/agents"
import { randomAgentFirstName, randomAgentNameExcept } from "../../packages/agents/names"
import { useConversationFlow } from "../conversation-flow"
import { PrimeComposer } from "./prime-composer"
import { useAgents, useConversationDraft } from "../agent-state"
import { usePrimeSessionState, usePrimeSessionSelection, useWorkspacePath } from "../prime-agent-state"
import { AgentAvatar } from "./agent-avatar"
import { useAgentCreation, type AgentSection } from "../agent-creation"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { styles } from "./agent-settings.styles"
import { styles as rosterStyles } from "./agent-roster.styles"

function createCharacters(): Agent["avatar"][] {
  return Array.from(crypto.getRandomValues(new Uint32Array(12)), (seed) => ({ kind: "generated", seed }))
}
function avatarKey(avatar: Agent["avatar"]): string {
  return typeof avatar === "string" ? avatar : `generated:${avatar.seed}`
}

/** Creation and refinement share one inline form. */
export function AgentSettingsDialog({ agent, onClose, section = "Customize", onSaved }: { agent?: Agent; onClose: () => void; section?: AgentSection; onSaved?: (name: string) => void }) {
  const { roster, client, execute } = useAgents()
  const workspace = useWorkspacePath()
  const sessions = usePrimeSessionState()
  const { selectedSessionId } = usePrimeSessionSelection()
  const currentWorkspace = sessions.data.find((session) => session.id === selectedSessionId)?.cwd
    ?? roster.agents.find((item) => item.id === roster.selectedAgentId)?.cwd ?? workspace.data ?? ""
  const [id] = useState(() => agent?.id ?? crypto.randomUUID())
  const [draft, setDraft] = useConversationDraft(`agent:${id}`)
  const flow = useConversationFlow(`agent:${id}`)
  const { setAdding } = useAgentCreation()
  const [creationStarted, setCreationStarted] = useState(false)
  const submitting = flow.submission.status === "creating" || flow.submission.status === "sending"
  const [expectedNativeName] = useState(agent?.name)
  const [expectedRevision] = useState(() => agent?.revision ?? 0)
  const [characters, setCharacters] = useState(() => agent ? [agent.avatar, ...createCharacters().slice(1)] : createCharacters())
  const [settings, setSettings] = useState<AgentSettings>(() => agent ?? { name: Effect.runSync(randomAgentFirstName), avatar: characters[0] ?? "fern", role: "", instructions: "", cwd: currentWorkspace, provider: "", model: "" })
  const [initialSettings] = useState(settings)
  const changed = settings.name.trim() !== initialSettings.name.trim()
    || avatarKey(settings.avatar) !== avatarKey(initialSettings.avatar)
    || settings.instructions !== initialSettings.instructions
    || settings.cwd !== initialSettings.cwd
    || settings.role !== initialSettings.role
    || settings.provider !== initialSettings.provider
    || settings.model !== initialSettings.model
  const [creationPanel, setPanel] = useState<AgentSection>("Customize")
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [choosingFolder, setChoosingFolder] = useState(false)
  const [error, setError] = useState<string>()
  const nameInputId = useId()
  const [previousName, setPreviousName] = useState<string>()
  const nameRef = useRef<HTMLInputElement>(null)
  const folder = settings.cwd || currentWorkspace
  const update = <K extends keyof AgentSettings>(key: K, value: AgentSettings[K]) => setSettings((current) => ({ ...current, [key]: value }))
  const renderPanel = (displayedPanel: AgentSection) => <div key={displayedPanel} {...stylex.props(styles.revealContent)}>
          {displayedPanel === "Customize" ? <div {...stylex.props(styles.fields, styles.fullWidth)}>
          <div {...stylex.props(styles.identity, !agent && styles.draftIdentity)}>
            <span {...stylex.props(styles.portrait)}><AgentAvatar avatar={settings.avatar} size="default" animated/></span>
            <div {...stylex.props(styles.nameLabel)}>
              <label htmlFor={nameInputId}>Name</label>
              <div {...stylex.props(styles.nameRow)}>
                <Input id={nameInputId} ref={nameRef} xstyle={styles.name} name="agentName" autoComplete="off" required maxLength={100} placeholder="A name of their own" value={settings.name} onChange={(event) => { setPreviousName(undefined); update("name", event.target.value) }}/>
                <button type="button" aria-label="Randomize Agent name" title="Randomize name" {...stylex.props(styles.nameRandomizer, styles.keyboard)} onClick={() => {
                  setPreviousName(settings.name)
                  update("name", Effect.runSync(randomAgentNameExcept(settings.name)))
                }}><ShuffleIcon size={16}/></button>
              </div>
              {previousName !== undefined ? <button type="button" {...stylex.props(styles.nameUndo, styles.keyboard)} onClick={() => {
                update("name", previousName)
                setPreviousName(undefined)
                nameRef.current?.focus()
              }} aria-label="Undo name change">Undo</button> : null}
            </div>
          </div>
          <div>
            <div {...stylex.props(styles.galleryHeading)}><span>Character</span><button type="button" {...stylex.props(styles.shuffle, styles.keyboard)} onClick={() => setCharacters([settings.avatar, ...createCharacters().slice(1)])}><ShuffleIcon {...stylex.props(styles.icon)}/>More faces</button></div>
            <div {...stylex.props(styles.gallery)} role="group" aria-label="Choose a character">
              {characters.map((avatar, index) => <button key={avatarKey(avatar)} type="button" {...stylex.props(styles.character, styles.keyboard, avatarKey(settings.avatar) === avatarKey(avatar) && styles.selected)} aria-label={`Character ${index + 1}`} aria-pressed={avatarKey(settings.avatar) === avatarKey(avatar)} onClick={() => update("avatar", avatar)}><AgentAvatar avatar={avatar} animated/></button>)}
            </div>
          </div>
          </div> : null}
          {displayedPanel === "Folder" ? <div {...stylex.props(styles.fullWidth)}>
          <div {...stylex.props(styles.workspace)}>
            <FolderIcon {...stylex.props(styles.icon)}/><div {...stylex.props(styles.folder)}><span>Working folder</span><span title={folder} {...stylex.props(styles.folderName)}>{folder || "Choose a folder"}</span></div>
            <button type="button" disabled={Boolean(agent?.root)} {...stylex.props(styles.changeFolder, styles.keyboard)} onClick={() => {
              setChoosingFolder(true)
              setError(undefined)
              void execute(() => client.chooseWorkspace()).then((result) => {
                setChoosingFolder(false)
                if (result.ok) { if (result.value) update("cwd", result.value) }
                else setError(result.error)
              })
            }}>{choosingFolder ? "Choosing…" : "Change folder"}</button>
          </div>
          {agent?.root ? <p {...stylex.props(styles.description)}>Saved with this Agent. Its working folder is read-only after its conversation is prepared.</p> : null}
          </div> : null}
  </div>
  const settingsForm = <form onSubmit={(event) => {
        event.preventDefault()
        if (!agent || saving || choosingFolder || !changed) return
        if (!folder) { setError("Choose a folder for your Agent first."); return }
        setSaving(true)
        setError(undefined)
        void execute(() => client.save({ ...settings, cwd: folder, id, expectedRevision, expectedNativeName })).then((result) => {
          setSaving(false)
          if (result.ok) { onSaved?.(result.value.name); onClose() }
          else setError(result.error)
        })
      }}>
        <fieldset disabled={saving || choosingFolder || creationStarted} {...stylex.props(styles.fields, !agent && styles.composerFields)}>
          <legend {...stylex.props(rosterStyles.hidden)}>Your Agent</legend>
          {agent ? renderPanel(section) : <AnimatedTabs tabs={[{ label: "Customize" }, { label: "Folder" }]} aria-label="Agent settings" disabled={saving || choosingFolder || creationStarted} value={creationPanel} onValueChange={(value) => {
            if (value === "Customize" || value === "Folder") setPanel(value)
          }}>
            {(["Customize", "Folder"] as const).map((item) => <Tabs.Panel key={item} value={item} {...stylex.props(styles.fullWidth, styles.keyboard)}>{renderPanel(item)}</Tabs.Panel>)}
          </AnimatedTabs>}
          {error ? <p role="alert" {...stylex.props(styles.error)}>{error}</p> : null}
          {agent ? <div {...stylex.props(styles.actions)}><p role="status" {...stylex.props(styles.saveStatus)}>{saving ? "Saving changes…" : changed ? "Unsaved changes" : "No unsaved changes"}</p><Button disabled={!changed} variant="secondary" xstyle={styles.save} type="submit">{saving ? "Saving…" : "Save changes"}</Button></div> : null}
        </fieldset>
      </form>
  return <section aria-label={agent ? `Edit ${agent.name}` : "Create Agent"} {...stylex.props(agent ? styles.inlinePanel : styles.creationComposer)}>
      {agent ? <button type="button" aria-label="Close Agent settings" disabled={saving || choosingFolder} onClick={onClose} {...stylex.props(styles.cancel, styles.keyboard)}><XIcon size={16}/></button> : null}
      {agent ? settingsForm : <DraftAgentSettingsPanel name={settings.name} avatar={settings.avatar} open={settingsOpen} onOpenChange={setSettingsOpen} disabled={creationStarted} choosingFolder={choosingFolder} renderComposer={(control) => <PrimeComposer footerControl={<div {...stylex.props(styles.draftFooter)}>{control}<DraftModelPicker sessionId={selectedSessionId ?? undefined} provider={settings.provider} model={settings.model} disabled={creationStarted || choosingFolder} onChange={(provider, model) => setSettings((current) => ({ ...current, provider, model }))}/></div>} agentName={settings.name} connected draft={draft} draftHero feedback={flow.submission}
        acceptedEffort={undefined} modelChangePending={false} models={[]} modelsPending={false}
        onDraftChange={setDraft} onEffortChange={async () => {}} onEffortError={() => {}} onModelSelect={() => {}}
        recovering={false} selectedModel={undefined} sessionSelected={false} stopAction={() => {}}
        stopping={false} submitting={submitting || choosingFolder} working={false}
        submitAction={async () => {
          if (!draft.trim() || submitting || choosingFolder) return
          if (!folder) { setError("Choose a folder for your Agent first."); return }
          if (Boolean(settings.provider.trim()) !== Boolean(settings.model.trim())) { setError("Enter both a provider and model ID, or choose Use default model."); return }
          if (!settings.name.trim()) { setError("Give your Agent a name first."); return }
          setError(undefined)
          setCreationStarted(true)
          setAdding(true)
          await flow.send({ agentId: id, settings: { ...settings, provider: settings.provider.trim(), model: settings.model.trim(), cwd: folder } })
        }}/>}>
        {settingsForm}
      </DraftAgentSettingsPanel>}
      {!agent && error && !settingsOpen ? <p role="alert" {...stylex.props(styles.error)}>{error}</p> : null}
  </section>
}

/** A single inline panel keeps refinement beside the root’s composer and preserves its draft. */
export function AgentControls({ agent, showTabs = true }: { agent: Agent; showTabs?: boolean }) {
  const { editing, setEditing } = useAgentCreation()
  const open = editing?.agentId === agent.id
  const lastSection = useRef<AgentSection>("Customize")
  useEffect(() => { if (open) lastSection.current = editing.section }, [open, editing])
  const [saved, setSaved] = useState<{ agentId: string; name: string }>()
  useEffect(() => { if (open) setSaved(undefined) }, [open])
  const trigger = useRef<HTMLButtonElement | null>(null)
  return <div {...stylex.props(styles.controls)}>
    {showTabs || open ? <div onClickCapture={(event) => {
      if (event.target instanceof Element) trigger.current = event.target.closest("button")
    }}><AnimatedTabs tabs={[{ label: "Customize" }, { label: "Folder" }]} aria-label="Agent settings sections" value={open ? editing.section : null} onDeselect={() => setEditing(null)} onValueChange={(section) => {
      if (section === "Customize" || section === "Folder") setEditing({ agentId: agent.id, section })
    }}>
      <Tabs.Panel value={open ? editing.section : "Customize"}>
        <AgentSettingsDialog key={agent.id} agent={agent} onSaved={(name) => setSaved({ agentId: agent.id, name })} section={open ? editing.section : lastSection.current} onClose={() => { setEditing(null); trigger.current?.focus() }}/>
      </Tabs.Panel>
    </AnimatedTabs></div> : null}
    {!open && saved?.agentId === agent.id ? <p role="status" {...stylex.props(styles.saveStatus)}>Changes saved for {saved.name}.</p> : null}
  </div>
}
