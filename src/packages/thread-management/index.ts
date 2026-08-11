/** Durable, reversible organization for Ernie's thread sidebar. */
export interface ThreadManagementState {
  readonly archiveFolded: boolean;
  readonly archivedThreadIds: readonly string[];
  readonly foldedRepositoryPaths: readonly string[];
  readonly orderByRepository: Readonly<Record<string, readonly string[]>>;
}

/** The safe initial state when no thread preferences exist. */
export const emptyThreadManagementState: ThreadManagementState = {
  archiveFolded: true,
  archivedThreadIds: [],
  foldedRepositoryPaths: [],
  orderByRepository: {},
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseUniqueStrings(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) return null;
  const strings = value.filter(
    (item): item is string => typeof item === 'string' && item.length > 0,
  );
  return strings.length === value.length && new Set(strings).size === strings.length
    ? strings
    : null;
}

/** Parse unknown persisted preferences into valid thread-management state. */
export function parseThreadManagementState(
  value: unknown,
): ThreadManagementState {
  if (!isRecord(value) || typeof value.archiveFolded !== 'boolean') {
    return emptyThreadManagementState;
  }

  const archivedThreadIds = parseUniqueStrings(value.archivedThreadIds);
  const foldedRepositoryPaths = parseUniqueStrings(value.foldedRepositoryPaths);
  if (
    archivedThreadIds === null ||
    foldedRepositoryPaths === null ||
    !isRecord(value.orderByRepository)
  ) {
    return emptyThreadManagementState;
  }

  const orderByRepository: Record<string, readonly string[]> = {};
  for (const [repositoryPath, rawOrder] of Object.entries(
    value.orderByRepository,
  )) {
    const order = parseUniqueStrings(rawOrder);
    if (repositoryPath.length === 0 || order === null) {
      return emptyThreadManagementState;
    }
    orderByRepository[repositoryPath] = order;
  }

  return {
    archiveFolded: value.archiveFolded,
    archivedThreadIds,
    foldedRepositoryPaths,
    orderByRepository,
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

/** Move one thread into or out of Ernie's reversible archive. */
export function setThreadArchived(
  state: ThreadManagementState,
  threadId: string,
  archived: boolean,
): ThreadManagementState {
  return {
    ...state,
    archivedThreadIds: updateMembership(
      state.archivedThreadIds,
      threadId,
      archived,
    ),
  };
}

/** Persist whether one repository's thread list is folded. */
export function setRepositoryFolded(
  state: ThreadManagementState,
  repositoryPath: string,
  folded: boolean,
): ThreadManagementState {
  return {
    ...state,
    foldedRepositoryPaths: updateMembership(
      state.foldedRepositoryPaths,
      repositoryPath,
      folded,
    ),
  };
}

/** Persist whether the archived-thread section is folded. */
export function setArchiveFolded(
  state: ThreadManagementState,
  folded: boolean,
): ThreadManagementState {
  return { ...state, archiveFolded: folded };
}

/** Apply a repository's saved order while retaining newly discovered threads. */
export function orderRepositoryThreadIds(
  state: ThreadManagementState,
  repositoryPath: string,
  availableThreadIds: readonly string[],
): readonly string[] {
  const available = new Set(availableThreadIds);
  const saved = state.orderByRepository[repositoryPath] ?? [];
  const ordered = saved.filter((threadId) => available.has(threadId));
  const orderedSet = new Set(ordered);
  return [
    ...ordered,
    ...availableThreadIds.filter((threadId) => !orderedSet.has(threadId)),
  ];
}

/** Reorder one repository thread relative to another visible thread. */
export function moveRepositoryThread(
  state: ThreadManagementState,
  repositoryPath: string,
  availableThreadIds: readonly string[],
  sourceThreadId: string,
  targetThreadId: string,
): ThreadManagementState {
  const ordered = orderRepositoryThreadIds(
    state,
    repositoryPath,
    availableThreadIds,
  );
  const sourceIndex = ordered.indexOf(sourceThreadId);
  const targetIndex = ordered.indexOf(targetThreadId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return state;
  }

  const moved = [...ordered];
  const [source] = moved.splice(sourceIndex, 1);
  if (source === undefined) return state;
  moved.splice(targetIndex, 0, source);

  const available = new Set(availableThreadIds);
  const savedRemainder = (state.orderByRepository[repositoryPath] ?? []).filter(
    (threadId) => !available.has(threadId),
  );
  return {
    ...state,
    orderByRepository: {
      ...state.orderByRepository,
      [repositoryPath]: [...moved, ...savedRemainder],
    },
  };
}
