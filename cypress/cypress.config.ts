import { defineConfig } from "cypress"

const rendererUrl = process.env.CYPRESS_rendererUrl
const uiLabUrl = process.env.CYPRESS_uiLabUrl

export default defineConfig({
  allowCypressEnv: false,
  e2e: {
    env: {
      ...(rendererUrl ? { rendererUrl } : {}),
      ...(uiLabUrl ? { uiLabUrl } : {}),
    },
    specPattern: uiLabUrl ? "e2e/ui-lab.cy.ts" : "e2e/prime-agent.cy.ts",
    supportFile: "support/e2e.ts",
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
