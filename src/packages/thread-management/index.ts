import {
  isJsonRecord,
  isJsonString,
  type JsonValue,
} from '../json-value';

/** Durable, reversible organization for Ernie's thread sidebar. */
export interface ThreadManagementState {
  readonly archivedThreadIds: readonly string[];
  readonly expandedRepositoryPath: string | null;
  readonly hiddenRepositoryPaths: readonly string[];
  readonly orderByRepository: Readonly<Record<string, readonly string[]>>;
  readonly pinnedThreadIds: readonly string[];
  readonly repositoryLabels: Readonly<Record<string, string>>;
  readonly repositoryOrder: readonly string[];
}

/** The safe initial state when no thread preferences exist. */
export const emptyThreadManagementState: ThreadManagementState = {
  archivedThreadIds: [],
  expandedRepositoryPath: null,
  hiddenRepositoryPaths: [],
  orderByRepository: {},
  pinnedThreadIds: [],
  repositoryLabels: {},
  repositoryOrder: [],
};

function parseUniqueStrings(value: JsonValue): readonly string[] | null {
  if (!Array.isArray(value)) return null;
  const strings = value.filter(
    (item): item is string => isJsonString(item) && item.length > 0,
  );
  return strings.length === value.length && new Set(strings).size === strings.length
    ? strings
    : null;
}

function parseStringRecord(value: JsonValue): Readonly<Record<string, string>> | null {
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

/** Parse unknown persisted preferences into valid thread-management state. */
export function parseThreadManagementState(
  value: JsonValue,
): ThreadManagementState {
  if (!isJsonRecord(value)) {
    return emptyThreadManagementState;
  }

  const archivedThreadIds = parseUniqueStrings(value.archivedThreadIds);
  const hiddenRepositoryPaths =
    value.hiddenRepositoryPaths === undefined
      ? []
      : parseUniqueStrings(value.hiddenRepositoryPaths);
  const pinnedThreadIds =
    value.pinnedThreadIds === undefined
      ? []
      : parseUniqueStrings(value.pinnedThreadIds);
  const repositoryLabels =
    value.repositoryLabels === undefined
      ? {}
      : parseStringRecord(value.repositoryLabels);
  const repositoryOrder =
    value.repositoryOrder === undefined
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
  if (
    archivedThreadIds === null ||
    hiddenRepositoryPaths === null ||
    pinnedThreadIds === null ||
    repositoryLabels === null ||
    repositoryOrder === null ||
    expandedRepositoryPath === undefined ||
    !isJsonRecord(value.orderByRepository)
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
    archivedThreadIds,
    expandedRepositoryPath,
    hiddenRepositoryPaths,
    orderByRepository,
    pinnedThreadIds,
    repositoryLabels,
    repositoryOrder,
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

/** Move one thread into or out of the global pinned section. */
export function setThreadPinned(
  state: ThreadManagementState,
  threadId: string,
  pinned: boolean,
): ThreadManagementState {
  return {
    ...state,
    pinnedThreadIds: updateMembership(
      state.pinnedThreadIds,
      threadId,
      pinned,
    ),
  };
}

/** Reorder one pinned Agent without changing its pinned membership. */
export function movePinnedThread(
  state: ThreadManagementState,
  sourceThreadId: string,
  targetThreadId: string,
): ThreadManagementState {
  const sourceIndex = state.pinnedThreadIds.indexOf(sourceThreadId);
  const targetIndex = state.pinnedThreadIds.indexOf(targetThreadId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return state;

  const pinnedThreadIds = [...state.pinnedThreadIds];
  const [source] = pinnedThreadIds.splice(sourceIndex, 1);
  if (source === undefined) return state;
  pinnedThreadIds.splice(targetIndex, 0, source);
  return { ...state, pinnedThreadIds };
}

/** Persist the only repository whose contents are disclosed. */
export function setExpandedRepository(
  state: ThreadManagementState,
  repositoryPath: string | null,
): ThreadManagementState {
  return { ...state, expandedRepositoryPath: repositoryPath };
}

/** Hide or restore one repository without deleting its durable organization. */
export function setRepositoryHidden(
  state: ThreadManagementState,
  repositoryPath: string,
  hidden: boolean,
): ThreadManagementState {
  return {
    ...state,
    hiddenRepositoryPaths: updateMembership(
      state.hiddenRepositoryPaths,
      repositoryPath,
      hidden,
    ),
  };
}

/** Assign or clear the display label for one repository. */
export function setRepositoryLabel(
  state: ThreadManagementState,
  repositoryPath: string,
  label: string | null,
): ThreadManagementState {
  const repositoryLabels = { ...state.repositoryLabels };
  const normalized = label?.trim() ?? '';
  if (normalized.length === 0) {
    delete repositoryLabels[repositoryPath];
  } else {
    repositoryLabels[repositoryPath] = normalized;
  }
  return { ...state, repositoryLabels };
}

/** Append newly discovered repositories without activity-based reordering. */
export function rememberRepositoryPaths(
  state: ThreadManagementState,
  repositoryPaths: readonly string[],
): ThreadManagementState {
  const known = new Set(state.repositoryOrder);
  const additions = repositoryPaths.filter((path) => !known.has(path));
  return additions.length === 0
    ? state
    : { ...state, repositoryOrder: [...state.repositoryOrder, ...additions] };
}

/** Apply first-seen repository order while retaining new repository paths. */
export function orderRepositoryPaths(
  state: ThreadManagementState,
  repositoryPaths: readonly string[],
): readonly string[] {
  const available = new Set(repositoryPaths);
  const ordered = state.repositoryOrder.filter((path) => available.has(path));
  const orderedSet = new Set(ordered);
  return [
    ...ordered,
    ...repositoryPaths.filter((path) => !orderedSet.has(path)),
  ];
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
