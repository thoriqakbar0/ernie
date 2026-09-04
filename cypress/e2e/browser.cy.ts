// @lat: [[tests#Behavior specifications#Development boundary#Browser recovery]]
describe("Ernie browser development", () => {
  after(() => {
    cy.task("writeBrowserHmrRevision", "initial", { log: false })
  })

  // Updated by Cypress Author on 2026-09-05: protect visible styling during the StyleX migration.
  it("loads styled controls and preserves runtime recovery and renderer HMR", () => {
    cy.env(["browserUrl"], { log: false }).then(({ browserUrl }) => {
      if (typeof browserUrl !== "string" || browserUrl.length === 0) {
        throw new Error("The browser test launcher did not provide a URL")
      }
      cy.visit(browserUrl, { log: false })
    })

    cy.get("body").should("have.css", "font-family").and("include", "Geist")
    cy.get("html").should("have.css", "line-height", "24px")
    cy.get("vite-error-overlay").should("not.exist")
    cy.get("#empty-state-prompt")
      .should("be.visible")
      .and("have.css", "min-height", "40px")
      .and("have.css", "max-height", "160px")
      .and("have.css", "border-top-width", "0px")
    cy.get('[data-slot="input-group"]').should("have.css", "flex-direction", "column")
    cy.get('[data-cy="prime-empty-create"]').should("have.css", "height", "32px")
    cy.get("#empty-state-prompt").type("Keep this integration session ready")
    cy.document().its("documentElement.dataset.ernieHmrRevision").should("equal", "initial")
    cy.get('[data-cy="prime-empty-create"]').should("be.enabled")
    cy.task("seedPersistedPrimeAgentSession", null, { log: false })
    cy.get("#chat-message").should("be.enabled")

    for (const width of [600, 320]) {
      cy.viewport(width, 800)
      cy.document().then((document) => {
        expect(document.documentElement.scrollWidth).to.be.at.most(
          document.documentElement.clientWidth,
        )
      })
    }

    cy.viewport(1_100, 750)
    cy.get("#chat-message").should("be.enabled")
    cy.task("stopExternalPrimeAgentDaemon", null, { log: false })
    cy.contains("Couldn’t reconnect to Prime Agent.").should("be.visible")
    cy.wait(1_250, { log: false })
    cy.contains("Couldn’t reconnect to Prime Agent.").should("be.visible")
    cy.task("startExternalPrimeAgentDaemon", null, { log: false })
    cy.contains("Couldn’t reconnect to Prime Agent.").should("not.exist")
    cy.get("#chat-message").should("be.enabled")

    cy.task("writeBrowserHmrRevision", "updated", { log: false })
    cy.document().its("documentElement.dataset.ernieHmrRevision").should("equal", "updated")
    cy.get("#chat-message").should("be.enabled")

    cy.get('[aria-label="New conversation"]').click()
    cy.get('[data-slot="dialog-trigger"]').click()
    cy.get('[role="dialog"]').should("be.visible")
    cy.get('[aria-label="Search workspaces"]').should("be.focused").type("no-such-workspace")
    cy.contains("No matching workspace").should("be.visible")
    cy.get('[aria-label="Search workspaces"]').type("{esc}")
    cy.get('[role="dialog"]').should("not.exist")
    cy.get('[aria-label="Close sidebar"]').click()
    cy.get("#ernie-sidebar").should("not.exist")
    cy.get('[aria-label="Open sidebar"]').click()
    cy.get("#ernie-sidebar").should("be.visible")
  })
})
