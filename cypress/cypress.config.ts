import { defineConfig } from "cypress"

const rendererUrl = process.env.CYPRESS_rendererUrl

export default defineConfig({
  allowCypressEnv: false,
  e2e: {
    env: rendererUrl ? { rendererUrl } : {},
    specPattern: "e2e/**/*.cy.ts",
    supportFile: "support/e2e.ts",
  },
  defaultCommandTimeout: 15_000,
  pageLoadTimeout: 30_000,
  retries: 0,
  screenshotOnRunFailure: true,
  video: false,
  viewportHeight: 750,
  viewportWidth: 1_100,
})
