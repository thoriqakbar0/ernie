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

    cy.contains("h2", /Start work in/).should("be.visible")
    cy.document().its("documentElement.dataset.ernieHmrRevision").should("equal", "initial")
    cy.get('[data-cy="prime-empty-create"]').should("be.enabled").click()
    cy.contains("h2", /What should we build in/).should("be.visible")
    cy.get('[data-composer-placement="hero"]').should("be.visible")
    cy.get(".session-stage").then(($stage) => {
      const stage = $stage[0]
      if (!stage) throw new Error("Session stage is missing")
      const inspector = stage.ownerDocument.createElement("aside")
      inspector.className = "session-inspector"
      inspector.dataset.cy = "responsive-inspector-probe"
      inspector.textContent = "Session activity"
      stage.append(inspector)
    })

    for (const width of [600, 320]) {
      cy.viewport(width, 800)
      cy.get('[data-cy="responsive-inspector-probe"]').should(($inspector) => {
        const element = $inspector[0]
        if (!element) throw new Error("Session inspector is missing")
        const view = element.ownerDocument.defaultView
        if (!view) throw new Error("Renderer window is missing")
        expect(view.getComputedStyle(element).display).not.to.equal("none")
        expect(view.getComputedStyle(element).position).to.equal("static")
        const conversation = element.ownerDocument.querySelector<HTMLElement>(".conversation-pane")
        if (!conversation) throw new Error("Conversation pane is missing")
        expect(element.getBoundingClientRect().top).to.be.at.least(
          conversation.getBoundingClientRect().bottom - 1,
        )
      })
      cy.document().then((document) => {
        expect(document.documentElement.scrollWidth).to.be.at.most(
          document.documentElement.clientWidth,
        )
      })
    }

    cy.get('[data-cy="responsive-inspector-probe"]').then(($inspector) => $inspector.remove())

    cy.viewport(1_100, 750)
    cy.get("#chat-message").should("be.enabled")
    cy.task("seedPersistedPrimeAgentSession", null, { log: false })
    cy.task("stopExternalPrimeAgentDaemon", null, { log: false })
    cy.contains("Couldn’t reconnect to Prime Agent.").should("be.visible")
    cy.wait(1_250, { log: false })
    cy.contains("Couldn’t reconnect to Prime Agent.").should("be.visible")
    cy.task("startExternalPrimeAgentDaemon", null, { log: false })
    cy.contains("Couldn’t reconnect to Prime Agent.").should("not.exist")
    cy.get("#chat-message").should("be.enabled")

    cy.task("writeBrowserHmrRevision", "updated", { log: false })
    cy.document().its("documentElement.dataset.ernieHmrRevision").should("equal", "updated")
    cy.contains("h2", /What should we build in/).should("be.visible")
  })
})
