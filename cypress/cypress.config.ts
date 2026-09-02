import { writeFile } from "node:fs/promises"
import { defineConfig } from "cypress"

const rendererUrl = process.env.CYPRESS_rendererUrl
const browserUrl = process.env.CYPRESS_browserUrl
const hmrSentinelPath = process.env.CYPRESS_hmrSentinelPath

export default defineConfig({
  allowCypressEnv: false,
  e2e: {
    env: {
      ...(rendererUrl ? { rendererUrl } : {}),
      ...(browserUrl ? { browserUrl } : {}),
    },
    specPattern: browserUrl ? "e2e/browser.cy.ts" : "e2e/prime-agent.cy.ts",
    supportFile: "support/e2e.ts",
    setupNodeEvents(on) {
      if (!browserUrl) return
      if (!hmrSentinelPath) throw new Error("CYPRESS_hmrSentinelPath is required for browser integration")
      on("task", {
        async writeBrowserHmrRevision(revision: string) {
          await writeFile(
            hmrSentinelPath,
            `/** Browser development revision used to prove Vite HMR through the stable gateway. */\nexport const browserHmrRevision = ${JSON.stringify(revision)}\n`,
          )
          return null
        },
      })
    },
  },
  defaultCommandTimeout: 15_000,
  pageLoadTimeout: 30_000,
  retries: 0,
  screenshotsFolder: "screenshots",
  screenshotOnRunFailure: true,
  video: false,
  viewportHeight: 750,
  viewportWidth: 1_100,
})
