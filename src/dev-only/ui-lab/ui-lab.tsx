import { ChatWorkspace } from "../../renderer/components/chat-workspace"
import { Sidebar } from "../../renderer/components/sidebar"
import type { UiLabFixture } from "./fixtures"
import { UiLabPrimeAgent } from "./ui-lab-prime-agent"

/** Renders the production Ernie shell against a deterministic UI lab fixture. */
export function UiLab({ fixture }: Readonly<{ fixture: UiLabFixture }>) {
  return (
    <UiLabPrimeAgent fixture={fixture}>
      <main
        className="grid h-screen min-h-0 grid-cols-[236px_minmax(0,1fr)] overflow-hidden"
        data-ui-lab-scenario={fixture.name}
      >
        <Sidebar />
        <ChatWorkspace />
      </main>
    </UiLabPrimeAgent>
  )
}
