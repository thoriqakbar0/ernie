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

    cy.contains("h2", /Start work in/).should("be.visible")
    cy.document().its("documentElement.dataset.ernieHmrRevision").should("equal", "initial")
    cy.get('[data-cy="prime-empty-create"]').should("be.enabled").click()
    cy.contains("h2", /What should we build in/).should("be.visible")
    cy.get('[data-composer-placement="hero"]').should("be.visible")

    cy.task("writeBrowserHmrRevision", "updated", { log: false })
    cy.document().its("documentElement.dataset.ernieHmrRevision").should("equal", "updated")
    cy.contains("h2", /What should we build in/).should("be.visible")
  })
})
