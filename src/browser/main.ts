import "../renderer/main.tsx"
import { browserHmrRevision } from "@ernie-hmr-sentinel"

function applyBrowserHmrRevision(revision: string) {
  document.documentElement.dataset.ernieHmrRevision = revision
}

applyBrowserHmrRevision(browserHmrRevision)

if (import.meta.hot) {
  import.meta.hot.accept("@ernie-hmr-sentinel", (module) => {
    if (module) applyBrowserHmrRevision(module.browserHmrRevision)
  })
}
