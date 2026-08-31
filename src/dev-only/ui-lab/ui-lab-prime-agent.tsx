import { useState } from "react"
import type { PropsWithChildren } from "react"

import { createMockPrimeAgentClient } from "../prime-agent/mock"
import { PrimeAgentStateProvider } from "../../renderer/prime-agent-state"
import { UI_LAB_WORKSPACE_PATH, type UiLabFixture } from "./fixtures"

/** Provides a deterministic Prime Agent boundary for one UI lab fixture. */
export function UiLabPrimeAgent({
  children,
  fixture,
}: PropsWithChildren<Readonly<{ fixture: UiLabFixture }>>) {
  const [client] = useState(() => createMockPrimeAgentClient({
    initialSnapshots: fixture.snapshots,
  }))

  return (
    <PrimeAgentStateProvider
      client={client}
      getWorkspacePath={() => Promise.resolve(UI_LAB_WORKSPACE_PATH)}
    >
      {children}
    </PrimeAgentStateProvider>
  )
}
