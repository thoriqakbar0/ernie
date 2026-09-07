import { defineConfig } from "cypress"

export default defineConfig({
  allowCypressEnv: false,
  e2e: { baseUrl: "http://127.0.0.1:4391", specPattern: "e2e/updates.cy.ts", supportFile: false },
  screenshotsFolder: "screenshots",
  video: false,
})
