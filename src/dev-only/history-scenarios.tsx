import { AppHistoryPage } from "../renderer/components/app-history-page"
import type { HistoryRequest } from "../packages/app-history"

const items = [
  { id: "fixture-3", title: "External changes", origin: "external" as const, changedFileCount: 2, knownWorking: false },
  { id: "fixture-2", title: "A greener Ernie", origin: "customization" as const, changedFileCount: 3, knownWorking: true },
  { id: "fixture-1", title: "Original app", origin: "baseline" as const, changedFileCount: 12, knownWorking: true },
].map((item, index) => ({ ...item, tree: item.id, createdAt: new Date(Date.UTC(2026,8,7,10-index)).toISOString(), fileCount: 12, kept: false, complete: true, restorable: true, reason: null, proposedTitle: item.origin === "customization" ? item.title : null }))
/** Disposable browser fixture exercises the production page without a filesystem or daemon. */
async function client(input: HistoryRequest) {
  let value: unknown
  switch (input.method) {
    case "history.status": value = { workspace: "/fixture/managed-ernie", currentCheckpointId: "fixture-3", unsavedChanges: false, lastRecoveryId: "fixture-1", captureError: null }; break
    case "history.list": value = { items, cursor: null }; break
    case "history.inspect": value = items.find(item => item.id === input.checkpointId); break
    case "history.diff": value = input.path ? { path: input.path, currentTree: "fixture-3", sourceContent: true, before: {text:"accent: orange"}, current: {text:"accent: green"} } : { items: [{path:"src/renderer/theme.stylex.ts",change:"modified"}], cursor: null, total: 1 }; break
    case "history.prepare_restore": value = {id:"fixture-proposal"}; break
    case "history.request_restore": return {ok:false,error:{code:"approval_required",message:"Synthetic review only. This fixture cannot restore application files."}}
    default: value = {}
  }
  return {ok:true,value}
}
export default function HistoryScenarios() {
  return <><p role="note">Example history · These checkpoints are previews and cannot change your app.</p><AppHistoryPage client={client} embedded/></>
}
