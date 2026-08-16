import {
  isJsonRecord,
  isJsonString,
  type JsonValue,
} from '../../json-value';

/** Truthful activity shown for one Agent conversation. */
export type AgentConversationActivity =
  | 'working'
  | 'queued'
  | 'needs_input'
  | 'idle'
  | 'settled';

/** Repository or worktree folder available to repository navigation. */
export interface RepositoryNavigationFolder {
  readonly branchName: string | null;
  readonly label: string;
  readonly repositoryCwd: string;
  readonly value: string;
}

/** Live Agent data required to project repository navigation. */
export interface LiveAgentConversationSession {
  readonly activeSessionId: string;
  readonly activity: AgentConversationActivity;
  readonly cwd: string;
  readonly modifiedAt: string | null;
  readonly name: string;
  readonly sessionPath: string | null;
}

/** Saved Agent data required to project repository navigation. */
export interface SavedAgentConversationSession {
  readonly activity: Extract<
    AgentConversationActivity,
    'needs_input' | 'idle' | 'settled'
  >;
  readonly cwd: string;
  readonly modifiedAt: string;
  readonly name: string;
  readonly path: string;
}

/** One canonical Agent conversation, whether live or only stored on disk. */
export type AgentConversation =
  | Readonly<{
      activity: AgentConversationActivity;
      id: string;
      kind: 'live';
      session: LiveAgentConversationSession;
    }>
  | Readonly<{
      activity: AgentConversationActivity;
      id: string;
      kind: 'saved';
      session: SavedAgentConversationSession;
    }>;

/** One folder and its stable Agent conversation order. */
export interface RepositoryNavigationWorkspace {
  readonly folder: RepositoryNavigationFolder;
  readonly conversations: readonly AgentConversation[];
}

/** One repository root and all workspaces that belong to it. */
export interface RepositoryNavigationRepository {
  readonly folder: RepositoryNavigationFolder;
  readonly workspaces: readonly RepositoryNavigationWorkspace[];
  readonly conversations: readonly AgentConversation[];
}

/** One Agent conversation together with its repository location. */
export interface LocatedAgentConversation {
  readonly conversation: AgentConversation;
  readonly repository: RepositoryNavigationRepository;
  readonly workspace: RepositoryNavigationWorkspace;
}

/** One repository-navigation search match. */
export type RepositoryNavigationSearchResult =
  | Readonly<{
      breadcrumb: string;
      key: string;
      kind: 'repository';
      label: string;
      repositoryPath: string;
    }>
  | Readonly<{
      breadcrumb: string;
      key: string;
      kind: 'worktree';
      label: string;
      repositoryPath: string;
      workspacePath: string;
    }>
  | Readonly<{
      breadcrumb: string;
      conversation: AgentConversation;
      key: string;
      kind: 'Agent';
      label: string;
      repositoryPath: string;
    }>;

/** Durable, reversible organization for repository navigation. */
export interface RepositoryNavigationPreferences {
  readonly archivedWorkspacePaths: readonly string[];
  readonly archivedConversationIds: readonly string[];
  readonly expandedRepositoryPath: string | null;
  readonly hiddenRepositoryPaths: readonly string[];
  readonly lastViewedAtByConversation: Readonly<Record<string, string>>;
  readonly orderByWorkspace: Readonly<Record<string, readonly string[]>>;
  readonly pinnedConversationIds: readonly string[];
  readonly repositoryLabels: Readonly<Record<string, string>>;
  readonly repositoryOrder: readonly string[];
}

/** External facts used to project and validate repository navigation. */
export interface RepositoryNavigationSource {
  readonly connected: boolean;
  readonly folders: readonly RepositoryNavigationFolder[];
  readonly importingSessionPath: string | null;
  readonly liveSessions: readonly LiveAgentConversationSession[];
  readonly savedSessions: readonly SavedAgentConversationSession[];
  readonly selectedSessionId: string | null;
}

/** Presentation inputs which remain owned by the React adapter. */
export interface RepositoryNavigationDisplay {
  readonly pinsExpanded: boolean;
  readonly revealedWorkspaceCwd: string | null;
  readonly searchQuery: string;
  readonly selectedCwd: string | null;
  readonly settledExpandedRepositoryPaths: ReadonlySet<string>;
  readonly worktreesExpandedRepositoryPaths: ReadonlySet<string>;
}

/** Ready-to-render navigation for one repository workspace. */
export interface RepositoryNavigationWorkspaceView {
  readonly needsInputCount: number;
  readonly visibleConversations: readonly AgentConversation[];
  readonly workingCount: number;
  readonly workspace: RepositoryNavigationWorkspace;
}

/** Ready-to-render repository navigation with disclosure already applied. */
export interface RepositoryNavigationRepositoryView {
  readonly hiddenSettledCount: number;
  readonly hiddenWorktreeCount: number;
  readonly needsInputCount: number;
  readonly repository: RepositoryNavigationRepository;
  readonly rootWorkspace: RepositoryNavigationWorkspaceView | null;
  readonly visibleWorktrees: readonly RepositoryNavigationWorkspaceView[];
  readonly workingCount: number;
}

/** Complete deterministic projection consumed by the sidebar adapter. */
export interface RepositoryNavigationProjection {
  readonly archivedConversations: readonly LocatedAgentConversation[];
  readonly archivedWorkspaces: readonly Readonly<{
    repository: RepositoryNavigationRepository;
    workspace: RepositoryNavigationWorkspace;
  }>[];
  readonly hiddenPinCount: number;
  readonly locatedConversations: ReadonlyMap<string, LocatedAgentConversation>;
  readonly pinnedConversations: readonly LocatedAgentConversation[];
  readonly repositories: readonly RepositoryNavigationRepository[];
  readonly searchResults: readonly RepositoryNavigationSearchResult[];
  readonly selectedConversationId: string | null;
  readonly visiblePinnedConversations: readonly LocatedAgentConversation[];
  readonly visibleRepositories: readonly RepositoryNavigationRepository[];
  readonly visibleRepositoryViews: readonly RepositoryNavigationRepositoryView[];
}

/** A validated preference change requested by the interface adapter. */
export type RepositoryNavigationCommand =
  | Readonly<{
      type: 'mark-viewed';
      conversationId: string;
      viewedAt: string;
    }>
  | Readonly<{
      type: 'set-workspace-archived';
      workspacePath: string;
      archived: boolean;
    }>
  | Readonly<{
      type: 'set-conversation-archived';
      conversationId: string;
      archived: boolean;
    }>
  | Readonly<{
      type: 'set-conversation-pinned';
      conversationId: string;
      pinned: boolean;
    }>
  | Readonly<{
      type: 'move-pinned-conversation';
      sourceConversationId: string;
      targetConversationId: string;
    }>
  | Readonly<{
      type: 'set-expanded-repository';
      repositoryPath: string | null;
    }>
  | Readonly<{
      type: 'set-repository-hidden';
      repositoryPath: string;
      hidden: boolean;
    }>
  | Readonly<{
      type: 'set-repository-label';
      repositoryPath: string;
      label: string | null;
    }>
  | Readonly<{ type: 'remember-repositories' }>
  | Readonly<{
      type: 'move-conversation';
      workspacePath: string;
      sourceConversationId: string;
      targetConversationId: string;
    }>;

/** The safe initial state when no repository preferences exist. */
export const emptyRepositoryNavigationPreferences: RepositoryNavigationPreferences = {
  archivedWorkspacePaths: [],
  archivedConversationIds: [],
  expandedRepositoryPath: null,
  hiddenRepositoryPaths: [],
  lastViewedAtByConversation: {},
  orderByWorkspace: {},
  pinnedConversationIds: [],
  repositoryLabels: {},
  repositoryOrder: [],
};

const collapsedPinLimit = 5;
const collapsedWorktreeLimit = 5;
const recentSettledLimit = 3;

function parseUniqueStrings(
  value: JsonValue | undefined,
): readonly string[] | null {
  if (!Array.isArray(value)) return null;
  const strings = value.filter(
    (item): item is string => isJsonString(item) && item.length > 0,
  );
  return strings.length === value.length && new Set(strings).size === strings.length
    ? strings
    : null;
}

function parseStringRecord(
  value: JsonValue | undefined,
): Readonly<Record<string, string>> | null {
  if (!isJsonRecord(value)) return null;
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key.length === 0 || !isJsonString(item) || item.trim().length === 0) {
      return null;
    }
    result[key] = item.trim();
  }
  return result;
}

function parseTimestampRecord(
  value: JsonValue | undefined,
): Readonly<Record<string, string>> | null {
  const record = parseStringRecord(value);
  if (record === null) return null;
  return Object.values(record).every((timestamp) =>
    Number.isFinite(Date.parse(timestamp)),
  )
    ? record
    : null;
}

/** Parse unknown persisted input into valid repository-navigation preferences. */
export function parseRepositoryNavigationPreferences(
  value: JsonValue,
): RepositoryNavigationPreferences {
  if (!isJsonRecord(value)) return emptyRepositoryNavigationPreferences;

  const archivedConversationIds = parseUniqueStrings(
    value.archivedConversationIds === undefined
      ? value.archivedThreadIds
      : value.archivedConversationIds,
  );
  const archivedWorkspacePaths = value.archivedWorkspacePaths === undefined
    ? []
    : parseUniqueStrings(value.archivedWorkspacePaths);
  const hiddenRepositoryPaths = value.hiddenRepositoryPaths === undefined
    ? []
    : parseUniqueStrings(value.hiddenRepositoryPaths);
  const rawPinnedConversationIds = value.pinnedConversationIds === undefined
    ? value.pinnedThreadIds
    : value.pinnedConversationIds;
  const pinnedConversationIds = rawPinnedConversationIds === undefined
    ? []
    : parseUniqueStrings(rawPinnedConversationIds);
  const rawLastViewedAtByConversation =
    value.lastViewedAtByConversation === undefined
      ? value.lastViewedAtByThread
      : value.lastViewedAtByConversation;
  const lastViewedAtByConversation = rawLastViewedAtByConversation === undefined
    ? {}
    : parseTimestampRecord(rawLastViewedAtByConversation);
  const repositoryLabels = value.repositoryLabels === undefined
    ? {}
    : parseStringRecord(value.repositoryLabels);
  const repositoryOrder = value.repositoryOrder === undefined
    ? []
    : parseUniqueStrings(value.repositoryOrder);
  const expandedRepositoryPath =
    value.expandedRepositoryPath === undefined ||
    value.expandedRepositoryPath === null
      ? null
      : isJsonString(value.expandedRepositoryPath) &&
          value.expandedRepositoryPath.length > 0
        ? value.expandedRepositoryPath
        : undefined;
  const rawOrderByWorkspace = value.orderByWorkspace === undefined
    ? value.orderByRepository
    : value.orderByWorkspace;
  if (
    archivedConversationIds === null ||
    archivedWorkspacePaths === null ||
    hiddenRepositoryPaths === null ||
    pinnedConversationIds === null ||
    lastViewedAtByConversation === null ||
    repositoryLabels === null ||
    repositoryOrder === null ||
    expandedRepositoryPath === undefined ||
    !isJsonRecord(rawOrderByWorkspace)
  ) {
    return emptyRepositoryNavigationPreferences;
  }

  const orderByWorkspace: Record<string, readonly string[]> = {};
  for (const [repositoryPath, rawOrder] of Object.entries(
    rawOrderByWorkspace,
  )) {
    const order = parseUniqueStrings(rawOrder);
    if (repositoryPath.length === 0 || order === null) {
      return emptyRepositoryNavigationPreferences;
    }
    orderByWorkspace[repositoryPath] = order;
  }

  return {
    archivedConversationIds,
    archivedWorkspacePaths,
    expandedRepositoryPath,
    hiddenRepositoryPaths,
    lastViewedAtByConversation,
    orderByWorkspace,
    pinnedConversationIds,
    repositoryLabels,
    repositoryOrder,
  };
}

function liveAgentConversationIdentity(
  session: LiveAgentConversationSession,
): string {
  return session.sessionPath === null
    ? `live:${session.activeSessionId}`
    : `session:${session.sessionPath}`;
}

function savedAgentConversationIdentity(
  session: SavedAgentConversationSession,
): string {
  return `session:${session.path}`;
}

function fallbackIdentity(cwd: string, name: string): string {
  return `${cwd}\u0000${name}`;
}

function hasUnseenActivity(
  preferences: RepositoryNavigationPreferences,
  conversationId: string,
  activityAt: string | null,
): boolean {
  if (activityAt === null) return false;
  const lastViewedAt = preferences.lastViewedAtByConversation[conversationId];
  if (lastViewedAt === undefined) return false;
  const activityTime = Date.parse(activityAt);
  const viewedTime = Date.parse(lastViewedAt);
  return Number.isFinite(activityTime) &&
    Number.isFinite(viewedTime) &&
    activityTime > viewedTime;
}

function projectActivity(
  rawActivity: AgentConversationActivity,
  modifiedAt: string | null,
  conversationId: string,
  connected: boolean,
  preferences: RepositoryNavigationPreferences,
): AgentConversationActivity {
  if (!connected && rawActivity !== 'settled') return 'idle';
  if (rawActivity === 'working' || rawActivity === 'queued') return rawActivity;
  if (modifiedAt === null) return rawActivity;
  return hasUnseenActivity(preferences, conversationId, modifiedAt)
    ? 'needs_input'
    : 'settled';
}

function modifiedTime(conversation: AgentConversation): number {
  const parsed = Date.parse(conversation.session.modifiedAt ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function activityOrder(activity: AgentConversationActivity): number {
  return {
    working: 0,
    needs_input: 1,
    queued: 2,
    idle: 3,
    settled: 4,
  }[activity];
}

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`Repository navigation received duplicate ${label}.`);
  }
}

function orderKnown(
  savedOrder: readonly string[],
  availableValues: readonly string[],
): readonly string[] {
  const available = new Set(availableValues);
  const ordered = savedOrder.filter((value) => available.has(value));
  const orderedSet = new Set(ordered);
  return [
    ...ordered,
    ...availableValues.filter((value) => !orderedSet.has(value)),
  ];
}

function projectConversations(
  source: RepositoryNavigationSource,
  preferences: RepositoryNavigationPreferences,
  folder: RepositoryNavigationFolder,
): readonly AgentConversation[] {
  const liveSessions = source.liveSessions.filter(
    (session) => session.cwd === folder.value,
  );
  const livePaths = new Set(
    liveSessions.flatMap((session) =>
      session.sessionPath === null ? [] : [session.sessionPath],
    ),
  );
  const pathlessLiveIdentities = new Set(
    liveSessions.flatMap((session) =>
      session.sessionPath === null
        ? [fallbackIdentity(session.cwd, session.name)]
        : [],
    ),
  );
  const conversations: AgentConversation[] = [
    ...liveSessions.map((session): AgentConversation => {
      const id = liveAgentConversationIdentity(session);
      return {
        activity: projectActivity(
          session.activity,
          session.modifiedAt,
          id,
          source.connected,
          preferences,
        ),
        id,
        kind: 'live',
        session,
      };
    }),
    ...source.savedSessions
      .filter(
        (session) =>
          session.cwd === folder.value &&
          !livePaths.has(session.path) &&
          !pathlessLiveIdentities.has(
            fallbackIdentity(session.cwd, session.name),
          ),
      )
      .map((session): AgentConversation => {
        const id = savedAgentConversationIdentity(session);
        return {
          activity: projectActivity(
            session.activity,
            session.modifiedAt,
            id,
            source.connected,
            preferences,
          ),
          id,
          kind: 'saved',
          session,
        };
      }),
  ];
  assertUnique(conversations.map((conversation) => conversation.id), 'conversation identities');
  const byId = new Map(
    conversations.map((conversation) => [conversation.id, conversation]),
  );
  return orderKnown(
    preferences.orderByWorkspace[folder.value] ?? [],
    [...byId.keys()],
  ).flatMap((id) => {
    const conversation = byId.get(id);
    return conversation === undefined ? [] : [conversation];
  });
}

function activityCount(
  conversations: readonly AgentConversation[],
  activity: AgentConversationActivity,
): number {
  return conversations.filter(
    (conversation) => conversation.activity === activity,
  ).length;
}

function projectRepositoryView(
  repository: RepositoryNavigationRepository,
  archivedConversationIds: ReadonlySet<string>,
  archivedWorkspacePaths: ReadonlySet<string>,
  pinnedConversationIds: ReadonlySet<string>,
  selectedConversationId: string | null,
  display: RepositoryNavigationDisplay,
): RepositoryNavigationRepositoryView {
  const unarchived = repository.workspaces
    .filter(
      (workspace) => !archivedWorkspacePaths.has(workspace.folder.value),
    )
    .flatMap((workspace) => workspace.conversations)
    .filter(
      (conversation) => !archivedConversationIds.has(conversation.id),
    );
  const settled = unarchived
    .filter(
      (conversation) =>
        !pinnedConversationIds.has(conversation.id) &&
        conversation.activity === 'settled',
    )
    .sort((left, right) => modifiedTime(right) - modifiedTime(left));
  const settledExpanded = display.settledExpandedRepositoryPaths.has(
    repository.folder.value,
  );
  const visibleSettledIds = new Set(
    (settledExpanded ? settled : settled.slice(0, recentSettledLimit)).map(
      (conversation) => conversation.id,
    ),
  );
  const selectedSettled = settled.find(
    (conversation) => conversation.id === selectedConversationId,
  );
  if (selectedSettled !== undefined) {
    visibleSettledIds.add(selectedSettled.id);
  }
  const visibleConversationsFor = (
    workspace: RepositoryNavigationWorkspace,
  ): readonly AgentConversation[] =>
    workspace.conversations.filter((conversation) => {
      if (
        archivedConversationIds.has(conversation.id) ||
        pinnedConversationIds.has(conversation.id)
      ) {
        return false;
      }
      return conversation.activity !== 'settled' ||
        visibleSettledIds.has(conversation.id);
    });
  const workspaceView = (
    workspace: RepositoryNavigationWorkspace,
  ): RepositoryNavigationWorkspaceView => {
    const workspaceUnarchived = workspace.conversations.filter(
      (conversation) => !archivedConversationIds.has(conversation.id),
    );
    return {
      needsInputCount: activityCount(workspaceUnarchived, 'needs_input'),
      visibleConversations: visibleConversationsFor(workspace),
      workingCount: activityCount(workspaceUnarchived, 'working'),
      workspace,
    };
  };
  const rootWorkspace = repository.workspaces.find(
    (workspace) => workspace.folder.value === repository.folder.value,
  );
  const worktreeEntries = repository.workspaces
    .filter(
      (workspace) =>
        workspace.folder.value !== repository.folder.value &&
        !archivedWorkspacePaths.has(workspace.folder.value),
    )
    .map((workspace, order) => {
      const view = workspaceView(workspace);
      const selectedOrRevealed =
        workspace.folder.value === display.selectedCwd ||
        workspace.folder.value === display.revealedWorkspaceCwd;
      const alwaysVisible = selectedOrRevealed ||
        view.visibleConversations.some(
          (conversation) => conversation.activity !== 'idle',
        );
      return {
        alwaysVisible,
        latestActivity: Math.max(
          0,
          ...workspace.conversations.map(modifiedTime),
        ),
        order,
        selectedOrRevealed,
        view,
      };
    })
    .filter(
      (entry) =>
        entry.selectedOrRevealed || entry.view.visibleConversations.length > 0,
    );
  const alwaysVisibleWorktrees = worktreeEntries.filter(
    (entry) => entry.alwaysVisible,
  );
  const quietWorktrees = worktreeEntries
    .filter((entry) => !entry.alwaysVisible)
    .sort(
      (left, right) =>
        right.latestActivity - left.latestActivity || left.order - right.order,
    );
  const visibleWorktrees = [
    ...alwaysVisibleWorktrees,
    ...(display.worktreesExpandedRepositoryPaths.has(repository.folder.value)
      ? quietWorktrees
      : quietWorktrees.slice(0, collapsedWorktreeLimit)),
  ]
    .sort((left, right) => left.order - right.order)
    .map((entry) => entry.view);

  return {
    hiddenSettledCount: Math.max(0, settled.length - recentSettledLimit),
    hiddenWorktreeCount: Math.max(
      0,
      quietWorktrees.length - collapsedWorktreeLimit,
    ),
    needsInputCount: activityCount(unarchived, 'needs_input'),
    repository,
    rootWorkspace: rootWorkspace === undefined
      ? null
      : workspaceView(rootWorkspace),
    visibleWorktrees,
    workingCount: activityCount(unarchived, 'working'),
  };
}

/** Project repository navigation from external facts and durable preferences. */
export function projectRepositoryNavigation(
  source: RepositoryNavigationSource,
  preferences: RepositoryNavigationPreferences,
  display: RepositoryNavigationDisplay,
): RepositoryNavigationProjection {
  assertUnique(source.folders.map((folder) => folder.value), 'folder paths');
  assertUnique(
    source.liveSessions.map((session) => session.activeSessionId),
    'live session identities',
  );
  assertUnique(
    source.savedSessions.map((session) => session.path),
    'saved session paths',
  );

  const workspaceGroups = source.folders.map(
    (folder): RepositoryNavigationWorkspace => ({
      folder,
      conversations: projectConversations(source, preferences, folder),
    }),
  );
  const grouped = new Map<string, RepositoryNavigationWorkspace[]>();
  for (const workspace of workspaceGroups) {
    const current = grouped.get(workspace.folder.repositoryCwd) ?? [];
    grouped.set(workspace.folder.repositoryCwd, [...current, workspace]);
  }

  const unorderedRepositories = [...grouped.entries()].map(
    ([repositoryCwd, workspaces]): RepositoryNavigationRepository => {
      const rootWorkspace = workspaces.find(
        (workspace) => workspace.folder.value === repositoryCwd,
      );
      const fallbackLabel =
        repositoryCwd.split(/[\\/]/u).filter(Boolean).at(-1) ?? repositoryCwd;
      const baseFolder = rootWorkspace?.folder ?? {
        branchName: null,
        label: fallbackLabel,
        repositoryCwd,
        value: repositoryCwd,
      };
      const folder = {
        ...baseFolder,
        label: preferences.repositoryLabels[repositoryCwd] ?? baseFolder.label,
      };
      const orderedWorkspaces = [...workspaces].sort((left, right) => {
        if (left.folder.value === repositoryCwd) return -1;
        if (right.folder.value === repositoryCwd) return 1;
        return (left.folder.branchName ?? left.folder.label).localeCompare(
          right.folder.branchName ?? right.folder.label,
        );
      });
      return {
        folder,
        workspaces: orderedWorkspaces,
        conversations: orderedWorkspaces.flatMap(
          (workspace) => workspace.conversations,
        ),
      };
    },
  );
  const repositoriesByPath = new Map(
    unorderedRepositories.map((repository) => [
      repository.folder.value,
      repository,
    ]),
  );
  const repositories = orderKnown(
    preferences.repositoryOrder,
    unorderedRepositories.map((repository) => repository.folder.value),
  ).flatMap((path) => {
    const repository = repositoriesByPath.get(path);
    return repository === undefined ? [] : [repository];
  });
  assertUnique(
    repositories.flatMap((repository) =>
      repository.conversations.map((conversation) => conversation.id),
    ),
    'conversation identities',
  );
  const hiddenRepositoryPaths = new Set(preferences.hiddenRepositoryPaths);
  const archivedWorkspacePaths = new Set(preferences.archivedWorkspacePaths);
  const archivedConversationIds = new Set(preferences.archivedConversationIds);
  const pinnedConversationIds = new Set(preferences.pinnedConversationIds);
  const visibleRepositories = repositories.filter(
    (repository) => !hiddenRepositoryPaths.has(repository.folder.value),
  );
  const locatedConversations = new Map<string, LocatedAgentConversation>();
  for (const repository of repositories) {
    for (const workspace of repository.workspaces) {
      for (const conversation of workspace.conversations) {
        locatedConversations.set(conversation.id, {
          conversation,
          repository,
          workspace,
        });
      }
    }
  }
  const pinnedConversations = preferences.pinnedConversationIds.flatMap(
    (conversationId): readonly LocatedAgentConversation[] => {
      const located = locatedConversations.get(conversationId);
      return located === undefined ||
        archivedConversationIds.has(conversationId) ||
        archivedWorkspacePaths.has(located.workspace.folder.value)
        ? []
        : [located];
    },
  );
  const visiblePinnedConversations = display.pinsExpanded
    ? pinnedConversations
    : pinnedConversations.slice(0, collapsedPinLimit);
  const archivedConversations = preferences.archivedConversationIds.flatMap(
    (conversationId): readonly LocatedAgentConversation[] => {
      const located = locatedConversations.get(conversationId);
      return located === undefined ||
        archivedWorkspacePaths.has(located.workspace.folder.value)
        ? []
        : [located];
    },
  );
  const archivedWorkspaces = repositories.flatMap((repository) =>
    repository.workspaces.flatMap((workspace) =>
      workspace.folder.value !== repository.folder.value &&
      archivedWorkspacePaths.has(workspace.folder.value)
        ? [{ repository, workspace }]
        : [],
    ),
  );
  const query = display.searchQuery.trim().toLocaleLowerCase();
  const searchResults: RepositoryNavigationSearchResult[] = [];
  if (query.length > 0) {
    for (const repository of repositories) {
      const repositoryHidden = hiddenRepositoryPaths.has(repository.folder.value);
      if (!repositoryHidden) {
        searchResults.push({
          breadcrumb: repository.folder.value,
          key: `repository:${repository.folder.value}`,
          kind: 'repository',
          label: repository.folder.label,
          repositoryPath: repository.folder.value,
        });
        for (const workspace of repository.workspaces) {
          if (
            workspace.folder.value === repository.folder.value ||
            archivedWorkspacePaths.has(workspace.folder.value)
          ) {
            continue;
          }
          searchResults.push({
            breadcrumb: repository.folder.label,
            key: `worktree:${workspace.folder.value}`,
            kind: 'worktree',
            label: workspace.folder.branchName ?? workspace.folder.label,
            repositoryPath: repository.folder.value,
            workspacePath: workspace.folder.value,
          });
        }
      }
      for (const workspace of repository.workspaces) {
        if (archivedWorkspacePaths.has(workspace.folder.value)) continue;
        for (const conversation of workspace.conversations) {
          if (
            archivedConversationIds.has(conversation.id) ||
            (repositoryHidden && !pinnedConversationIds.has(conversation.id))
          ) {
            continue;
          }
          searchResults.push({
            breadcrumb:
              workspace.folder.value === repository.folder.value
                ? repository.folder.label
                : `${repository.folder.label} · ${workspace.folder.branchName ?? workspace.folder.label}`,
            conversation,
            key: `Agent:${conversation.id}`,
            kind: 'Agent',
            label: conversation.session.name,
            repositoryPath: repository.folder.value,
          });
        }
      }
    }
    searchResults.splice(
      0,
      searchResults.length,
      ...searchResults
        .filter((result) =>
          `${result.label} ${result.breadcrumb}`
            .toLocaleLowerCase()
            .includes(query),
        )
        .sort((left, right) => {
          const exactDifference =
            Number(right.label.toLocaleLowerCase() === query) -
            Number(left.label.toLocaleLowerCase() === query);
          if (exactDifference !== 0) return exactDifference;
          if (left.kind === 'Agent' && right.kind === 'Agent') {
            const statusDifference =
              activityOrder(left.conversation.activity) -
              activityOrder(right.conversation.activity);
            return statusDifference !== 0
              ? statusDifference
              : modifiedTime(right.conversation) - modifiedTime(left.conversation);
          }
          if (left.kind === 'Agent') return -1;
          if (right.kind === 'Agent') return 1;
          return left.label.localeCompare(right.label);
        }),
    );
  }
  const selectedLiveSession = source.liveSessions.find(
    (session) => session.activeSessionId === source.selectedSessionId,
  );
  const selectedConversationId = source.importingSessionPath !== null
    ? `session:${source.importingSessionPath}`
    : selectedLiveSession === undefined
      ? null
      : liveAgentConversationIdentity(selectedLiveSession);
  const visibleRepositoryViews = visibleRepositories.map((repository) =>
    projectRepositoryView(
      repository,
      archivedConversationIds,
      archivedWorkspacePaths,
      pinnedConversationIds,
      selectedConversationId,
      display,
    )
  );

  return {
    archivedConversations,
    archivedWorkspaces,
    hiddenPinCount: Math.max(0, pinnedConversations.length - collapsedPinLimit),
    locatedConversations,
    pinnedConversations,
    repositories,
    searchResults,
    selectedConversationId,
    visiblePinnedConversations,
    visibleRepositories,
    visibleRepositoryViews,
  };
}

function updateMembership(
  values: readonly string[],
  value: string,
  present: boolean,
): readonly string[] {
  const withoutValue = values.filter((candidate) => candidate !== value);
  return present ? [...withoutValue, value] : withoutValue;
}

function moveValue(
  values: readonly string[],
  sourceValue: string,
  targetValue: string,
): readonly string[] | null {
  const sourceIndex = values.indexOf(sourceValue);
  const targetIndex = values.indexOf(targetValue);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return null;
  const moved = [...values];
  const [source] = moved.splice(sourceIndex, 1);
  if (source === undefined) return null;
  moved.splice(targetIndex, 0, source);
  return moved;
}

interface RepositoryNavigationTargets {
  conversationIds: ReadonlySet<string>;
  repositoryPaths: ReadonlySet<string>;
  workspaceConversationIds: ReadonlyMap<string, readonly string[]>;
  workspacePaths: ReadonlySet<string>;
}

function sourceTargets(
  source: RepositoryNavigationSource,
  preferences: RepositoryNavigationPreferences,
): RepositoryNavigationTargets {
  const projection = projectRepositoryNavigation(source, preferences, {
    pinsExpanded: true,
    revealedWorkspaceCwd: null,
    searchQuery: '',
    selectedCwd: null,
    settledExpandedRepositoryPaths: new Set(),
    worktreesExpandedRepositoryPaths: new Set(),
  });
  const conversationIds = new Set<string>();
  const workspaceConversationIds = new Map<string, string[]>();
  for (const repository of projection.repositories) {
    for (const workspace of repository.workspaces) {
      const ids = workspace.conversations.map((conversation) => conversation.id);
      workspaceConversationIds.set(workspace.folder.value, ids);
      for (const id of ids) conversationIds.add(id);
    }
  }
  return {
    conversationIds,
    repositoryPaths: new Set(
      projection.repositories.map((repository) => repository.folder.value),
    ),
    workspaceConversationIds,
    workspacePaths: new Set(source.folders.map((folder) => folder.value)),
  };
}

/** Apply one validated navigation preference command; stale targets are no-ops. */
export function transitionRepositoryNavigation(
  preferences: RepositoryNavigationPreferences,
  source: RepositoryNavigationSource,
  command: RepositoryNavigationCommand,
): RepositoryNavigationPreferences {
  const targets = sourceTargets(source, preferences);
  switch (command.type) {
    case 'mark-viewed': {
      if (!targets.conversationIds.has(command.conversationId)) return preferences;
      const viewedTime = Date.parse(command.viewedAt);
      if (!Number.isFinite(viewedTime)) return preferences;
      const current = preferences.lastViewedAtByConversation[command.conversationId];
      if (current !== undefined && Date.parse(current) >= viewedTime) return preferences;
      return {
        ...preferences,
        lastViewedAtByConversation: {
          ...preferences.lastViewedAtByConversation,
          [command.conversationId]: command.viewedAt,
        },
      };
    }
    case 'set-workspace-archived':
      return targets.workspacePaths.has(command.workspacePath) &&
        !targets.repositoryPaths.has(command.workspacePath)
        ? {
            ...preferences,
            archivedWorkspacePaths: updateMembership(
              preferences.archivedWorkspacePaths,
              command.workspacePath,
              command.archived,
            ),
          }
        : preferences;
    case 'set-conversation-archived':
      return targets.conversationIds.has(command.conversationId)
        ? {
            ...preferences,
            archivedConversationIds: updateMembership(
              preferences.archivedConversationIds,
              command.conversationId,
              command.archived,
            ),
            pinnedConversationIds: command.archived
              ? updateMembership(
                  preferences.pinnedConversationIds,
                  command.conversationId,
                  false,
                )
              : preferences.pinnedConversationIds,
          }
        : preferences;
    case 'set-conversation-pinned':
      return targets.conversationIds.has(command.conversationId) &&
        (!command.pinned ||
          !preferences.archivedConversationIds.includes(command.conversationId))
        ? {
            ...preferences,
            pinnedConversationIds: updateMembership(
              preferences.pinnedConversationIds,
              command.conversationId,
              command.pinned,
            ),
          }
        : preferences;
    case 'move-pinned-conversation': {
      if (
        !targets.conversationIds.has(command.sourceConversationId) ||
        !targets.conversationIds.has(command.targetConversationId)
      ) {
        return preferences;
      }
      const moved = moveValue(
        preferences.pinnedConversationIds,
        command.sourceConversationId,
        command.targetConversationId,
      );
      return moved === null ? preferences : { ...preferences, pinnedConversationIds: moved };
    }
    case 'set-expanded-repository':
      return command.repositoryPath === null ||
        targets.repositoryPaths.has(command.repositoryPath)
        ? { ...preferences, expandedRepositoryPath: command.repositoryPath }
        : preferences;
    case 'set-repository-hidden':
      return targets.repositoryPaths.has(command.repositoryPath)
        ? {
            ...preferences,
            hiddenRepositoryPaths: updateMembership(
              preferences.hiddenRepositoryPaths,
              command.repositoryPath,
              command.hidden,
            ),
          }
        : preferences;
    case 'set-repository-label': {
      if (!targets.repositoryPaths.has(command.repositoryPath)) return preferences;
      const repositoryLabels = { ...preferences.repositoryLabels };
      const label = command.label?.trim() ?? '';
      if (label.length === 0) delete repositoryLabels[command.repositoryPath];
      else repositoryLabels[command.repositoryPath] = label;
      return { ...preferences, repositoryLabels };
    }
    case 'remember-repositories': {
      const known = new Set(preferences.repositoryOrder);
      const additions = [...targets.repositoryPaths].filter((path) => !known.has(path));
      return additions.length === 0
        ? preferences
        : {
            ...preferences,
            repositoryOrder: [...preferences.repositoryOrder, ...additions],
          };
    }
    case 'move-conversation': {
      const available = targets.workspaceConversationIds.get(command.workspacePath);
      if (available === undefined) return preferences;
      const ordered = orderKnown(
        preferences.orderByWorkspace[command.workspacePath] ?? [],
        available,
      );
      const moved = moveValue(
        ordered,
        command.sourceConversationId,
        command.targetConversationId,
      );
      if (moved === null) return preferences;
      const availableSet = new Set(available);
      const remainder = (preferences.orderByWorkspace[command.workspacePath] ?? [])
        .filter((id) => !availableSet.has(id));
      return {
        ...preferences,
        orderByWorkspace: {
          ...preferences.orderByWorkspace,
          [command.workspacePath]: [...moved, ...remainder],
        },
      };
    }
  }
}
