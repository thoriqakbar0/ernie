import { UI_LAB_SCENARIOS, type UiLabScenario } from "../../src/dev-only/ui-lab/fixtures"

describe("Ernie UI lab", () => {
  for (const scenario of UI_LAB_SCENARIOS) {
    it(`renders the ${scenario} scenario`, () => {
      visitScenario(scenario)
      cy.get(`[data-ui-lab-scenario="${scenario}"]`).should("be.visible")
      cy.get('aside[aria-label="Sidebar"]').should("be.visible")

      switch (scenario) {
        case "empty":
          cy.contains("h2", "Start a conversation").should("be.visible")
          cy.contains("No conversations yet").should("be.visible")
          cy.get('[data-cy="prime-empty-create"]').should("be.enabled")
          break
        case "draft":
          cy.contains("h2", "What should we build in /projects/ernie?").should("be.visible")
          cy.get('[data-composer-placement="hero"]').should("be.visible")
          cy.get('[aria-label="Model: GPT-5"]').should("be.enabled").click()
          cy.get('[role="dialog"][aria-label="Model picker"]').should("be.visible")
          cy.get('[role="option"]').should("have.length.greaterThan", 1)
          break
        case "working":
          cy.contains('[role="status"]', "Working").should("be.visible")
          cy.get('[aria-label="Stop Prime Agent"]').should("be.enabled")
          cy.get('#chat-message').should("have.attr", "placeholder", "Queue a follow-up...")
          break
        case "reconnecting":
          cy.contains('[role="status"]', "Prime Agent is reconnecting").should("be.visible")
          cy.get('#chat-message').should("be.disabled")
          break
        case "failed":
          cy.contains('[role="alert"]', "Prime Agent connection failed").should("be.visible")
          cy.get('#chat-message').should("be.disabled")
          break
      }
    })
  }
})

function visitScenario(scenario: UiLabScenario) {
  cy.env(["uiLabUrl"], { log: false }).then(({ uiLabUrl }) => {
    if (typeof uiLabUrl !== "string" || uiLabUrl.length === 0) {
      throw new Error("The UI lab launcher did not provide a URL")
    }
    const url = new URL(uiLabUrl)
    url.searchParams.set("scenario", scenario)
    return cy.visit(url.toString(), { log: false })
  })
}
