// @lat: [[tests#Behavior specifications#Development boundary#Browser recovery]]
describe("Ernie browser development", () => {
  after(() => {
    cy.task("writeBrowserHmrRevision", "initial", { log: false })
  })

  it("uses the real Zenbu and Prime Agent runtime with renderer HMR", () => {
    cy.env(["browserUrl"], { log: false }).then(({ browserUrl }) => {
      if (typeof browserUrl !== "string" || browserUrl.length === 0) {
        throw new Error("The browser test launcher did not provide a URL")
      }
      cy.visit(browserUrl, { log: false })
    })

    cy.get("#empty-state-prompt").should("be.visible").type("Keep this integration session ready")
    cy.document().its("documentElement.dataset.ernieHmrRevision").should("equal", "initial")
    cy.get('[data-cy="prime-empty-create"]').should("be.enabled")
    cy.task("seedPersistedPrimeAgentSession", null, { log: false })
    cy.reload()
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
  })
})
