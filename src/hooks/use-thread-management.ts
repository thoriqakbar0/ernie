import { useEffect, useState } from 'react';

import {
  emptyThreadManagementState,
  parseThreadManagementState,
  type ThreadManagementState,
} from '@/packages/thread-management';

const threadManagementStorageKey = 'ernie:thread-management:v1';

function loadThreadManagementState(): ThreadManagementState {
  try {
    const serialized = window.localStorage.getItem(threadManagementStorageKey);
    return serialized === null
      ? emptyThreadManagementState
      : parseThreadManagementState(JSON.parse(serialized));
  } catch {
    return emptyThreadManagementState;
  }
}

/** Own Ernie's durable, local-only thread organization preferences. */
export function useThreadManagement(): readonly [
  ThreadManagementState,
  React.Dispatch<React.SetStateAction<ThreadManagementState>>,
] {
  const [state, setState] = useState(loadThreadManagementState);

  useEffect(() => {
    window.localStorage.setItem(
      threadManagementStorageKey,
      JSON.stringify(state),
    );
  }, [state]);

  return [state, setState] as const;
}
