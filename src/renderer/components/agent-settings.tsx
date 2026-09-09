import { readComposerModel } from "../composer-model"
import { DraftComposerControls } from "./draft-composer-controls"
import { AgentSettingsTabs } from "./agent-settings-tabs"
import * as stylex from "@stylexjs/stylex"
import { DraftAgentSettingsPanel } from "./draft-agent-settings-panel"
import { Tabs } from "@base-ui/react/tabs"
import { Effect } from "effect"
import { constVoid } from "effect/Function"
import { useId, useRef, useState } from "react"
import { FolderIcon, ShuffleIcon, XIcon } from "lucide-react"
import type { Agent, AgentSettings } from "../../packages/agents"
import {
  availableAgentName,
  randomAgentFirstName,
  randomAgentNameExcept,
} from "../../packages/agents/names"
import { useConversationFlow } from "../conversation-flow"
import { ContinueInFolder } from "./continue-in-folder"
import { PrimeComposer } from "./prime-composer"
import { useAgents, useConversationDraft } from "../agent-state"
import {
  usePrimeSessionState,
  usePrimeSessionSelection,
  useWorkspacePath,
} from "../prime-agent-state"
import { AgentAvatar } from "./agent-avatar"
import { useAgentCreation } from "../agent-creation"
import type { AgentSection } from "../agent-creation"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { styles } from "./agent-settings.styles"
import { styles as rosterStyles } from "./agent-roster.styles"

const createCharacters = (): Agent["avatar"][] =>
  Array.from(crypto.getRandomValues(new Uint32Array(12)), (seed) => ({
    kind: "generated",
    seed,
  }))
const avatarKey = (avatar: Agent["avatar"]): string =>
  typeof avatar === "string" ? avatar : `generated:${avatar.seed}`

const settingsChanged = (settings: AgentSettings, initial: AgentSettings): boolean =>
  settings.name.trim() !== initial.name.trim() ||
  avatarKey(settings.avatar) !== avatarKey(initial.avatar) ||
  settings.instructions !== initial.instructions ||
  settings.cwd !== initial.cwd ||
  settings.role !== initial.role ||
  settings.provider !== initial.provider ||
  settings.model !== initial.model ||
  settings.thinkingLevel !== initial.thinkingLevel ||
  settings.rlmMaxDepth !== initial.rlmMaxDepth

const saveStatus = (saving: boolean, changed: boolean): string => {
  if (saving) {
    return "Saving changes…"
  }
  return changed ? "Unsaved changes" : "No unsaved changes"
}

const SettingsPanel = ({
  displayedPanel,
  agent,
  settings,
  nameInputId,
  nameRef,
  previousName,
  setPreviousName,
  update,
  characters,
  setCharacters,
  folder,
  persistedRoot,
  choosingFolder,
  chooseFolder,
}: {
  displayedPanel: AgentSection
  agent?: Agent
  settings: AgentSettings
  nameInputId: string
  nameRef: React.RefObject<HTMLInputElement | null>
  previousName: string | undefined
  setPreviousName: (name: string | undefined) => void
  update: <K extends keyof AgentSettings>(key: K, value: AgentSettings[K]) => void
  characters: Agent["avatar"][]
  setCharacters: (characters: Agent["avatar"][]) => void
  folder: string
  persistedRoot: Agent["root"] | undefined
  choosingFolder: boolean
  chooseFolder: () => Promise<void>
}) => (
  <div key={displayedPanel} {...stylex.props(styles.revealContent)}>
    {displayedPanel === "Customize" ? (
      <div {...stylex.props(styles.fields, styles.fullWidth)}>
        <div {...stylex.props(styles.identity, !agent && styles.draftIdentity)}>
          <span {...stylex.props(styles.portrait)}>
            <AgentAvatar avatar={settings.avatar} size="default" animated />
          </span>
          <div {...stylex.props(styles.nameLabel)}>
            <label htmlFor={nameInputId}>Name</label>
            <div {...stylex.props(styles.nameRow)}>
              <Input
                id={nameInputId}
                ref={nameRef}
                xstyle={styles.name}
                name="agentName"
                autoComplete="off"
                required
                maxLength={100}
                placeholder="A name of their own"
                value={settings.name}
                onChange={(event) => {
                  setPreviousName(undefined)
                  update("name", event.target.value)
                }}
              />
              <button
                type="button"
                aria-label="Randomize Agent name"
                title="Randomize name"
                {...stylex.props(styles.nameRandomizer, styles.keyboard)}
                onClick={() => {
                  setPreviousName(settings.name)
                  update("name", Effect.runSync(randomAgentNameExcept(settings.name)))
                }}
              >
                <ShuffleIcon size={16} />
              </button>
            </div>
            {previousName === undefined ? null : (
              <button
                type="button"
                {...stylex.props(styles.nameUndo, styles.keyboard)}
                onClick={() => {
                  update("name", previousName)
                  setPreviousName(undefined)
                  nameRef.current?.focus()
                }}
                aria-label="Undo name change"
              >
                Undo
              </button>
            )}
          </div>
        </div>
        <div>
          <div {...stylex.props(styles.galleryHeading)}>
            <span>Character</span>
            <button
              type="button"
              {...stylex.props(styles.shuffle, styles.keyboard)}
              onClick={() => setCharacters([settings.avatar, ...createCharacters().slice(1)])}
            >
              <ShuffleIcon {...stylex.props(styles.icon)} />
              More faces
            </button>
          </div>
          <fieldset {...stylex.props(styles.gallery)} aria-label="Choose a character">
            {characters.map((avatar, index) => (
              <button
                key={avatarKey(avatar)}
                type="button"
                {...stylex.props(
                  styles.character,
                  styles.keyboard,
                  avatarKey(settings.avatar) === avatarKey(avatar) && styles.selected,
                )}
                aria-label={`Character ${index + 1}`}
                aria-pressed={avatarKey(settings.avatar) === avatarKey(avatar)}
                onClick={() => update("avatar", avatar)}
              >
                <AgentAvatar avatar={avatar} animated />
              </button>
            ))}
          </fieldset>
        </div>
      </div>
    ) : null}
    {displayedPanel === "Folder" ? (
      <div {...stylex.props(styles.fullWidth)}>
        <div {...stylex.props(styles.workspace)}>
          <FolderIcon {...stylex.props(styles.icon)} />
          <div {...stylex.props(styles.folder)}>
            <span>Working folder</span>
            <span title={folder} {...stylex.props(styles.folderName)}>
              {folder || "Choose a folder"}
            </span>
          </div>
          {persistedRoot ? null : (
            <button
              type="button"
              disabled={choosingFolder}
              {...stylex.props(styles.changeFolder, styles.keyboard)}
              onClick={chooseFolder}
            >
              {choosingFolder ? "Choosing…" : "Change folder"}
            </button>
          )}
        </div>
        {persistedRoot ? (
          <p {...stylex.props(styles.description)}>
            A different folder starts a new chat. This chat stays saved.
          </p>
        ) : null}
      </div>
    ) : null}
  </div>
)

const SettingsForm = ({
  agent,
  saving,
  choosingFolder,
  creationStarted,
  section,
  creationPanel,
  setCreationPanel,
  renderPanel,
  error,
  changed,
  onSubmit,
}: {
  agent?: Agent
  saving: boolean
  choosingFolder: boolean
  creationStarted: boolean
  section: AgentSection
  creationPanel: AgentSection
  setCreationPanel: (section: AgentSection) => void
  renderPanel: (section: AgentSection) => React.ReactNode
  error: string | undefined
  changed: boolean
  onSubmit: React.FormEventHandler<HTMLFormElement>
}) => (
  <form onSubmit={onSubmit}>
    <fieldset
      disabled={saving || choosingFolder || creationStarted}
      {...stylex.props(styles.fields, !agent && styles.composerFields)}
    >
      <legend {...stylex.props(rosterStyles.hidden)}>Your Agent</legend>
      {agent ? (
        renderPanel(section)
      ) : (
        <AgentSettingsTabs
          shape="rounded"
          tabs={[{ label: "Customize" }, { label: "Folder" }]}
          aria-label="Agent settings"
          disabled={saving || choosingFolder || creationStarted}
          value={creationPanel}
          onValueChange={(value) => {
            if (value === "Customize" || value === "Folder") {
              setCreationPanel(value)
            }
          }}
        >
          {(["Customize", "Folder"] as const).map((item) => (
            <Tabs.Panel
              key={item}
              value={item}
              {...stylex.props(styles.fullWidth, styles.keyboard)}
            >
              {renderPanel(item)}
            </Tabs.Panel>
          ))}
        </AgentSettingsTabs>
      )}
      {error ? (
        <p role="alert" {...stylex.props(styles.error)}>
          {error}
        </p>
      ) : null}
      {agent && (changed || saving) ? (
        <div {...stylex.props(styles.actions)}>
          <output {...stylex.props(styles.saveStatus)}>{saveStatus(saving, changed)}</output>
          <Button disabled={!changed} variant="secondary" xstyle={styles.save} type="submit">
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      ) : null}
    </fieldset>
  </form>
)

const folderControl = (choosing: boolean, cwd: string, systemFolder: string | undefined) => {
  const selected = Boolean(cwd && cwd !== systemFolder)
  let label = selected ? cwd.split(/[\\/]/u).findLast(Boolean) || cwd : "Choose folder"
  if (choosing) {
    label = "Choosing…"
  }
  return { label, selected }
}

const availableDraftSettings = (
  requested: AgentSettings,
  existing: Agent | undefined,
  id: string,
  root: Agent["root"] | undefined,
  sessions: readonly { id: string; name?: string }[],
  agents: readonly Agent[],
): AgentSettings => {
  const reservedNames = new Set<string>()
  for (const session of sessions) {
    if (session.id !== root?.sessionId && session.name) {
      reservedNames.add(session.name)
    }
  }
  for (const item of agents) {
    if (item.id !== id) {
      reservedNames.add(item.name)
    }
  }
  return existing
    ? requested
    : {
        ...requested,
        name: availableAgentName(requested.name, reservedNames),
      }
}

/** Creation and refinement share one inline form. */
export const AgentSettingsDialog = ({
  agent,
  onClose,
  section = "Customize",
  onSaved,
}: {
  agent?: Agent
  onClose: () => void
  section?: AgentSection
  onSaved?: (name: string) => void
}) => {
  const { roster, client, execute } = useAgents()
  const { continuation } = useAgentCreation()
  const workspace = useWorkspacePath()
  const sessions = usePrimeSessionState()
  const { selectedSessionId } = usePrimeSessionSelection()
  const currentWorkspace = agent?.cwd ?? continuation?.cwd ?? workspace.data ?? ""
  const [form, setForm] = useState(() => {
    const characters = agent ? [agent.avatar, ...createCharacters().slice(1)] : createCharacters()
    const settings: AgentSettings = agent ??
      continuation ?? {
        avatar: characters[0] ?? "fern",
        cwd: currentWorkspace,
        instructions: "",
        ...readComposerModel(),
        name: Effect.runSync(randomAgentFirstName),
        role: "",
      }
    return {
      characters,
      expectedNativeName: agent?.name,
      expectedRevision: agent?.revision ?? 0,
      id: agent?.id ?? crypto.randomUUID(),
      initialSettings: settings,
      settings,
    }
  })
  const { id, expectedNativeName, expectedRevision, characters, initialSettings } = form
  const setSettings = (updateSettings: (current: AgentSettings) => AgentSettings) =>
    setForm((current) => ({ ...current, settings: updateSettings(current.settings) }))
  const setCharacters = (nextCharacters: Agent["avatar"][]) =>
    setForm((current) => ({ ...current, characters: nextCharacters }))
  const persistedRoot = agent?.root ?? roster.agents.find((item) => item.id === id)?.root
  const settings = availableDraftSettings(
    form.settings,
    agent,
    id,
    persistedRoot,
    sessions.data,
    roster.agents,
  )
  const [draft, setDraft] = useConversationDraft(`agent:${id}`)
  const flow = useConversationFlow(`agent:${id}`)
  const { setAdding } = useAgentCreation()
  const [creationStarted, setCreationStarted] = useState(false)
  const submitting = flow.submission.status === "creating" || flow.submission.status === "sending"
  const changed = settingsChanged(settings, initialSettings)
  const [creationPanel, setCreationPanel] = useState<AgentSection>("Customize")
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [choosingFolder, setChoosingFolder] = useState(false)
  const [error, setError] = useState<string>()
  const nameInputId = useId()
  const [previousName, setPreviousName] = useState<string>()
  const nameRef = useRef<HTMLInputElement>(null)
  const folder = settings.cwd || currentWorkspace
  const modelSelected = [settings.provider, settings.model].every((value) => Boolean(value.trim()))
  const { label: folderLabel, selected: hasSelectedFolder } = folderControl(
    choosingFolder,
    settings.cwd,
    workspace.data,
  )
  const update = <K extends keyof AgentSettings>(key: K, value: AgentSettings[K]) =>
    setSettings((current) => ({ ...current, [key]: value }))
  const chooseFolder = async () => {
    setChoosingFolder(true)
    setError(undefined)
    const result = await execute(() => client.chooseWorkspace())
    setChoosingFolder(false)
    if (result.ok) {
      if (result.value) {
        update("cwd", result.value)
      }
    } else {
      setError(result.error)
    }
  }
  const renderPanel = (displayedPanel: AgentSection) => (
    <SettingsPanel
      displayedPanel={displayedPanel}
      agent={agent}
      settings={settings}
      nameInputId={nameInputId}
      nameRef={nameRef}
      previousName={previousName}
      setPreviousName={setPreviousName}
      update={update}
      characters={characters}
      setCharacters={setCharacters}
      folder={folder}
      persistedRoot={persistedRoot}
      choosingFolder={choosingFolder}
      chooseFolder={chooseFolder}
    />
  )
  const saveSettings: React.FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault()
    if (!agent || saving || choosingFolder || !changed) {
      return
    }
    if (!folder) {
      setError("Choose a folder for your Agent first.")
      return
    }
    setSaving(true)
    setError(undefined)
    const result = await execute(() =>
      client.save({ ...settings, cwd: folder, expectedNativeName, expectedRevision, id }),
    )
    setSaving(false)
    if (result.ok) {
      onSaved?.(result.value.name)
      onClose()
    } else {
      setError(result.error)
    }
  }
  const settingsForm = (
    <SettingsForm
      agent={agent}
      saving={saving}
      choosingFolder={choosingFolder}
      creationStarted={creationStarted}
      section={section}
      creationPanel={creationPanel}
      setCreationPanel={setCreationPanel}
      renderPanel={renderPanel}
      error={error}
      changed={changed}
      onSubmit={saveSettings}
    />
  )
  return (
    <section
      aria-label={agent ? `Edit ${agent.name}` : "Create Agent"}
      {...stylex.props(agent ? styles.inlinePanel : styles.creationComposer)}
    >
      {agent ? (
        <>
          {settingsForm}
          {section === "Folder" && persistedRoot ? <ContinueInFolder agent={agent} /> : null}
        </>
      ) : (
        <DraftAgentSettingsPanel
          name={settings.name}
          avatar={settings.avatar}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          disabled={creationStarted}
          choosingFolder={choosingFolder}
          renderComposer={(control) => (
            <PrimeComposer
              footerControl={
                <div {...stylex.props(styles.draftFooter)}>
                  {control}
                  <button
                    type="button"
                    title={choosingFolder ? "Choosing folder…" : `Current folder: ${folder}`}
                    aria-label={
                      choosingFolder
                        ? "Choosing working folder…"
                        : `Choose working folder. Current folder: ${folder}`
                    }
                    disabled={creationStarted || choosingFolder}
                    onClick={() => {
                      void chooseFolder()
                    }}
                    {...stylex.props(styles.composerFolder, styles.keyboard)}
                  >
                    {folderLabel}
                  </button>
                  {hasSelectedFolder && !persistedRoot ? (
                    <button
                      type="button"
                      aria-label="Clear selected folder"
                      title="Clear selected folder"
                      disabled={creationStarted || !workspace.data}
                      {...stylex.props(styles.composerFolder, styles.keyboard)}
                      onClick={() => update("cwd", workspace.data ?? "")}
                    >
                      <XIcon size={16} aria-hidden="true" />
                    </button>
                  ) : null}
                  <DraftComposerControls
                    sessionId={selectedSessionId ?? undefined}
                    settings={settings}
                    disabled={creationStarted || choosingFolder || Boolean(persistedRoot)}
                    onChange={(next) => setSettings(() => next)}
                  />
                </div>
              }
              agentName={settings.name}
              connected={!sessions.connection || sessions.connection.state.status === "connected"}
              draft={draft}
              draftHero
              feedback={flow.submission}
              modelChangePending={false}
              models={[]}
              modelsPending={false}
              onDraftChange={setDraft}
              onModelSelect={constVoid}
              recovering={false}
              selectedModel={undefined}
              modelSelected={modelSelected}
              sessionSelected={false}
              stopping={false}
              submitting={submitting || choosingFolder}
              working={false}
              submitAction={async () => {
                if (!draft.trim() || submitting || choosingFolder) {
                  return
                }
                if (!folder) {
                  setError("Choose a folder for your Agent first.")
                  return
                }
                if (!modelSelected) {
                  setError("Choose a model before sending.")
                  return
                }
                if (!settings.name.trim()) {
                  setError("Give your Agent a name first.")
                  return
                }
                setError(undefined)
                setCreationStarted(true)
                setAdding(true)
                try {
                  await flow.send({
                    agentId: id,
                    settings: {
                      ...settings,
                      cwd: folder,
                      model: settings.model.trim(),
                      provider: settings.provider.trim(),
                    },
                  })
                } finally {
                  setCreationStarted(false)
                }
              }}
            />
          )}
        >
          {settingsForm}
        </DraftAgentSettingsPanel>
      )}
      {!agent && error && !settingsOpen ? (
        <p role="alert" {...stylex.props(styles.error)}>
          {error}
        </p>
      ) : null}
    </section>
  )
}

/** The sidebar owns refinement controls and preserves the open form draft. */
export const AgentControls = ({ agent, showTabs = true }: { agent: Agent; showTabs?: boolean }) => {
  const { editing, setEditing } = useAgentCreation()
  const open = editing?.agentId === agent.id
  const [panelState, setPanelState] = useState<{ open: boolean; section: AgentSection }>({
    open,
    section: "Customize",
  })
  const [saved, setSaved] = useState<{ agentId: string; name: string }>()
  const displayedSection = open ? editing.section : panelState.section
  if (panelState.open !== open || panelState.section !== displayedSection) {
    setPanelState({ open, section: displayedSection })
    if (open && !panelState.open) {
      setSaved(undefined)
    }
  }
  const trigger = useRef<HTMLButtonElement | null>(null)
  return (
    <div {...stylex.props(styles.controls)}>
      {showTabs || open ? (
        <div
          onClickCapture={(event) => {
            if (event.target instanceof Element) {
              trigger.current = event.target.closest("button")
            }
          }}
        >
          <AgentSettingsTabs
            shape="rounded"
            tabs={[{ label: "Customize" }, { label: "Folder" }]}
            aria-label="Agent settings sections"
            value={open ? editing.section : null}
            onDeselect={() => setEditing(null)}
            onValueChange={(section) => {
              if (section === "Customize" || section === "Folder") {
                setEditing({ agentId: agent.id, section })
              }
            }}
          >
            <Tabs.Panel value={open ? editing.section : "Customize"}>
              <AgentSettingsDialog
                key={agent.id}
                agent={agent}
                onSaved={(name) => setSaved({ agentId: agent.id, name })}
                section={displayedSection}
                onClose={() => {
                  setEditing(null)
                  trigger.current?.focus()
                }}
              />
            </Tabs.Panel>
          </AgentSettingsTabs>
        </div>
      ) : null}
      {!open && saved?.agentId === agent.id ? (
        <output {...stylex.props(styles.saveStatus)}>Changes saved for {saved.name}.</output>
      ) : null}
    </div>
  )
}
