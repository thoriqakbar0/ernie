import { Option, Schema } from "effect"

import type { PrimeSessionSnapshot } from "../../packages/prime-agent"
import { createPrimeUsefulSessionFixture } from "../../packages/prime-agent/fixtures"

/** Every deterministic state exposed by the browser UI lab. */
export const UI_LAB_SCENARIOS = [
  "empty",
  "draft",
  "working",
  "reconnecting",
  "failed",
] as const

/** One state exposed by the browser UI lab. */
export type UiLabScenario = (typeof UI_LAB_SCENARIOS)[number]

type PopulatedUiLabScenario = Exclude<UiLabScenario, "empty">

/** One internally consistent seed selected by a lab URL. */
export type UiLabFixture =
  | Readonly<{ name: "empty"; snapshots: readonly [] }>
  | Readonly<{
      name: PopulatedUiLabScenario
      snapshots: readonly [PrimeSessionSnapshot]
    }>

/** The parsed result of the external lab URL. */
export type UiLabRoute =
  | Readonly<{ tag: "ready"; fixture: UiLabFixture }>
  | Readonly<{ tag: "invalid"; received: string }>

/** Stable workspace shown by every UI lab fixture. */
export const UI_LAB_WORKSPACE_PATH = "/projects/ernie"

const scenarioSchema = Schema.Literals(UI_LAB_SCENARIOS)
const sessionId = "ui-lab-session"
const model = { id: "gpt-5", provider: "openai", label: "GPT-5" }

/** Parses the scenario query once before React mounts. */
export function parseUiLabRoute(search: string): UiLabRoute {
  const received = new URLSearchParams(search).get("scenario") ?? "draft"
  const parsed = Schema.decodeUnknownOption(scenarioSchema)(received)
  return Option.isSome(parsed)
    ? { tag: "ready", fixture: getUiLabFixture(parsed.value) }
    : { tag: "invalid", received }
}

function getUiLabFixture(scenario: UiLabScenario): UiLabFixture {
  switch (scenario) {
    case "empty":
      return { name: "empty", snapshots: [] }
    case "draft":
      return populatedFixture("draft", {
        session: {
          id: sessionId,
          cwd: UI_LAB_WORKSPACE_PATH,
          name: "New Prime Agent session",
          lifecycle: "draft",
          state: "idle",
          model,
        },
        messages: [],
        transport: { status: "connected" },
      })
    case "working":
      return populatedFixture("working", {
        session: {
          id: sessionId,
          cwd: UI_LAB_WORKSPACE_PATH,
          name: "Refine Ernie's interface",
          lifecycle: "live",
          state: "working",
          model,
        },
        messages: [
          {
            id: "ui-lab-user-message",
            role: "user",
            content: "Bring the Prime Agent workflow into one clear surface.",
          },
          {
            id: "ui-lab-assistant-message",
            role: "assistant",
            content: "I’m tracing the renderer state and tightening the main interaction.",
          },
        ],
        transport: { status: "connected" },
      })
    case "reconnecting":
      return populatedFixture("reconnecting", {
        session: {
          id: sessionId,
          cwd: UI_LAB_WORKSPACE_PATH,
          name: "Recover the active session",
          lifecycle: "live",
          state: "recovering",
          model,
        },
        messages: [{
          id: "ui-lab-reconnecting-message",
          role: "assistant",
          content: "The session state is safe. I’m reconnecting to Prime Agent.",
        }],
        transport: {
          status: "reconnecting",
          error: "Prime Agent is reconnecting",
        },
      })
    case "failed":
      return populatedFixture("failed", {
        session: {
          id: sessionId,
          cwd: UI_LAB_WORKSPACE_PATH,
          name: "Restore Prime Agent",
          lifecycle: "live",
          state: "recovering",
          model,
        },
        messages: [{
          id: "ui-lab-failed-message",
          role: "assistant",
          content: "The last confirmed transcript remains available.",
        }],
        transport: {
          status: "failed",
          error: "Prime Agent connection failed",
        },
      })
  }
}

function populatedFixture(
  name: PopulatedUiLabScenario,
  snapshot: Omit<PrimeSessionSnapshot, "useful">,
): UiLabFixture {
  return {
    name,
    snapshots: [{
      ...snapshot,
      useful: createPrimeUsefulSessionFixture(snapshot.session, snapshot.messages),
    }],
  }
}
