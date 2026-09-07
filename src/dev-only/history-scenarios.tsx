import * as stylex from "@stylexjs/stylex"
import { styles } from "../renderer/components/app-settings.styles"
import { AppHistoryPage } from "../renderer/components/app-history-page"
import type { HistoryRequest } from "../packages/app-history"

const items = [
  {
    changedFileCount: 2,
    id: "fixture-3",
    knownWorking: false,
    origin: "external" as const,
    title: "External changes",
  },
  {
    changedFileCount: 3,
    id: "fixture-2",
    knownWorking: true,
    origin: "customization" as const,
    title: "A greener Ernie",
  },
  {
    changedFileCount: 12,
    id: "fixture-1",
    knownWorking: true,
    origin: "baseline" as const,
    title: "Original app",
  },
].map((item, index) => ({
  ...item,
  complete: true,
  createdAt: new Date(Date.UTC(2026, 8, 7, 10 - index)).toISOString(),
  fileCount: 12,
  kept: false,
  proposedTitle: item.origin === "customization" ? item.title : null,
  reason: null,
  restorable: true,
  tree: item.id,
}))
/** Disposable browser fixture exercises the production page without a filesystem or daemon. */
const client = (input: HistoryRequest) => {
  let value: unknown
  switch (input.method) {
    case "history.status": {
      value = {
        captureError: null,
        currentCheckpointId: "fixture-3",
        lastRecoveryId: "fixture-1",
        unsavedChanges: false,
        workspace: "/fixture/managed-ernie",
      }
      break
    }
    case "history.list": {
      value = { cursor: null, items }
      break
    }
    case "history.inspect": {
      value = items.find((item) => item.id === input.checkpointId)
      break
    }
    case "history.diff": {
      value = input.path
        ? {
            before: { text: "accent: orange" },
            current: { text: "accent: green" },
            currentTree: "fixture-3",
            path: input.path,
            sourceContent: true,
          }
        : {
            cursor: null,
            items: [{ change: "modified", path: "src/renderer/theme.stylex.ts" }],
            total: 1,
          }
      break
    }
    case "history.prepare_restore": {
      value = { id: "fixture-proposal" }
      break
    }
    case "history.request_restore": {
      return Promise.resolve({
        error: {
          code: "approval_required",
          message: "Synthetic review only. This fixture cannot restore application files.",
        },
        ok: false,
      })
    }
    default: {
      value = {}
    }
  }
  return Promise.resolve({ ok: true, value })
}
const HistoryScenarios = () => (
  <>
    <p role="note" {...stylex.props(styles.previewNotice)}>
      Preview only · Your app won’t change.
    </p>
    <AppHistoryPage client={client} embedded />
  </>
)

export default HistoryScenarios
