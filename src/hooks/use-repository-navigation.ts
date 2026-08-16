import { useEffect, useState } from 'react';

import {
  emptyRepositoryNavigationPreferences,
  parseRepositoryNavigationPreferences,
  type RepositoryNavigationPreferences,
} from '@/packages/repository-navigation';

const repositoryNavigationStorageKey = 'ernie:thread-management:v1';

function loadRepositoryNavigationPreferences(): RepositoryNavigationPreferences {
  try {
    const serialized = window.localStorage.getItem(
      repositoryNavigationStorageKey,
    );
    return serialized === null
      ? emptyRepositoryNavigationPreferences
      : parseRepositoryNavigationPreferences(JSON.parse(serialized));
  } catch {
    return emptyRepositoryNavigationPreferences;
  }
}

/** Own Ernie's durable, local-only repository navigation preferences. */
export function useRepositoryNavigation(): readonly [
  RepositoryNavigationPreferences,
  React.Dispatch<React.SetStateAction<RepositoryNavigationPreferences>>,
] {
  const [preferences, setPreferences] = useState(
    loadRepositoryNavigationPreferences,
  );

  useEffect(() => {
    window.localStorage.setItem(
      repositoryNavigationStorageKey,
      JSON.stringify(preferences),
    );
  }, [preferences]);

  return [preferences, setPreferences] as const;
}
