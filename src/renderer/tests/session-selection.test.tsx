import assert from "node:assert/strict"
import { after, afterEach, test } from "node:test"
import globalJsdom from "global-jsdom"

import { ChatWorkspace } from "../components/chat-workspace"
import { SessionInspector } from "../components/session-inspector"
import { Sidebar } from "../components/sidebar"
import {
  PrimeAgentStateProvider,
  type PrimeSessionSelectionChannel,
} from "../prime-agent-state"
import { createMockPrimeAgentClient } from "../../dev-only/prime-agent/mock"

const cleanupDom = globalJsdom()
const { act, cleanup, fireEvent, render, screen, waitFor } = await import("@testing-library/react")

afterEach(async () => {
  cleanup()
  await new Promise((resolve) => setTimeout(resolve, 0))
})
after(cleanupDom)

function renderChatShell(client = createMockPrimeAgentClient()) {
  return render(
    <PrimeAgentStateProvider
      client={client}
      getWorkspacePath={async () => "/workspace/ernie"}
    >
      <Sidebar />
      <ChatWorkspace />
    </PrimeAgentStateProvider>,
  )
}

test("selecting a session changes the active workspace", async () => {
  renderChatShell()
  const originalSession = await screen.findByRole("button", {
    name: "Build the chat workspace",
  })
  await screen.findByRole("heading", { name: "Build the chat workspace" })

  fireEvent.click(screen.getByRole("button", { name: "New conversation" }))
  const newSession = await screen.findByRole("button", {
    name: "New Prime Agent session",
  })
  await screen.findByRole("heading", { name: "New Prime Agent session" })
  assert.equal(newSession.getAttribute("aria-current"), "page")

  fireEvent.click(originalSession)
  await screen.findByRole("heading", { name: "Build the chat workspace" })
  assert.equal(originalSession.getAttribute("aria-current"), "page")
  assert.equal(newSession.getAttribute("aria-current"), null)
})

test("an empty renderer accepts a session selected by another Zenbu view", async () => {
  const client = createMockPrimeAgentClient()
  const [session] = await client.listSessions()
  assert.ok(session)
  client.listSessions = async () => []

  const listeners = new Set<(sessionId: string) => void>()
  let selectedSessionId: string | undefined
  const selectionChannel: PrimeSessionSelectionChannel = {
    get: async () => selectedSessionId,
    select: async (sessionId) => {
      selectedSessionId = sessionId
      for (const listener of listeners) listener(sessionId)
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }

  render(
    <PrimeAgentStateProvider
      client={client}
      getWorkspacePath={async () => "/workspace/ernie"}
      selectionChannel={selectionChannel}
    >
      <Sidebar />
      <ChatWorkspace />
    </PrimeAgentStateProvider>,
  )

  await screen.findByRole("heading", { name: "Prime Agent" })
  assert.equal(screen.queryByRole("textbox", { name: "Message Prime Agent" }), null)

  await act(() => selectionChannel.select(session.id))

  await screen.findByRole("heading", { name: "Build the chat workspace" })
  assert.equal(
    screen.getByRole("button", { name: "Build the chat workspace" }).getAttribute("aria-current"),
    "page",
  )
  assert.equal(
    screen.getByRole("textbox", { name: "Message Prime Agent" }).hasAttribute("disabled"),
    false,
  )
})

test("a fresh workspace creates its first authoritative session", async () => {
  const client = createMockPrimeAgentClient()
  client.listSessions = async () => []

  render(
    <PrimeAgentStateProvider
      client={client}
      getWorkspacePath={async () => "/workspace/ernie"}
    >
      <ChatWorkspace />
    </PrimeAgentStateProvider>,
  )

  fireEvent.click(await screen.findByRole("button", { name: "New conversation" }))

  await screen.findByRole("heading", { name: "New Prime Agent session" })
  assert.equal(
    screen.getByRole("textbox", { name: "Message Prime Agent" }).hasAttribute("disabled"),
    false,
  )
})

test("a fresh workspace keeps a session creation failure visible", async () => {
  const client = createMockPrimeAgentClient()
  client.listSessions = async () => []
  client.createSession = async () => {
    throw new Error("Prime Agent daemon rejected the session")
  }

  render(
    <PrimeAgentStateProvider
      client={client}
      getWorkspacePath={async () => "/workspace/ernie"}
    >
      <ChatWorkspace />
    </PrimeAgentStateProvider>,
  )

  fireEvent.click(await screen.findByRole("button", { name: "New conversation" }))

  assert.ok(await screen.findByRole("alert"))
  assert.ok(screen.getByText("Prime Agent daemon rejected the session"))
  assert.ok(screen.getByRole("button", { name: "New conversation" }))
})

// @lat: [[tests#Behavior specifications#Renderer behavior#Draft isolation]]
test("a draft cannot leak into another selected session", async () => {
  renderChatShell()
  const originalSession = await screen.findByRole("button", {
    name: "Build the chat workspace",
  })
  const composer = await screen.findByRole("textbox", { name: "Message Prime Agent" })
  assert.ok(composer instanceof HTMLTextAreaElement)
  fireEvent.change(composer, { target: { value: "unfinished first-session draft" } })
  assert.equal(composer.value, "unfinished first-session draft")

  fireEvent.click(screen.getByRole("button", { name: "New conversation" }))
  await screen.findByRole("heading", { name: "New Prime Agent session" })
  await waitFor(() => assert.equal(composer.value, ""))

  fireEvent.click(originalSession)
  await screen.findByRole("heading", { name: "Build the chat workspace" })
  assert.equal(composer.value, "")
})

// @lat: [[tests#Behavior specifications#Renderer behavior#Selection convergence]]
test("rapid selection keeps the heading and current marker together", async () => {
  renderChatShell()
  const originalSession = await screen.findByRole("button", {
    name: "Build the chat workspace",
  })
  fireEvent.click(screen.getByRole("button", { name: "New conversation" }))
  const newSession = await screen.findByRole("button", { name: "New Prime Agent session" })
  await screen.findByRole("heading", { name: "New Prime Agent session" })

  for (let index = 0; index < 20; index += 1) {
    fireEvent.click(index % 2 === 0 ? originalSession : newSession)
  }

  await screen.findByRole("heading", { name: "New Prime Agent session" })
  assert.equal(originalSession.getAttribute("aria-current"), null)
  assert.equal(newSession.getAttribute("aria-current"), "page")
})

test("conversation groups fold without losing the selected session", async () => {
  renderChatShell()
  const foldButton = await screen.findByRole("button", { name: "Conversations" })
  const selectedSession = await screen.findByRole("button", {
    name: "Build the chat workspace",
  })
  assert.equal(foldButton.getAttribute("aria-expanded"), "true")
  assert.equal(selectedSession.getAttribute("aria-current"), "page")

  fireEvent.click(foldButton)
  assert.equal(foldButton.getAttribute("aria-expanded"), "false")
  assert.equal(screen.queryByRole("button", { name: "Build the chat workspace" }), null)

  fireEvent.click(foldButton)
  const restoredSession = await screen.findByRole("button", {
    name: "Build the chat workspace",
  })
  assert.equal(restoredSession.getAttribute("aria-current"), "page")
})

test("model picker waits for the authoritative snapshot", async () => {
  const client = createMockPrimeAgentClient()
  let acceptModel: (() => void) | undefined
  client.setModel = () => new Promise<void>((resolve) => {
    acceptModel = resolve
  })
  renderChatShell(client)
  await screen.findByRole("heading", { name: "Build the chat workspace" })
  fireEvent.click(await screen.findByRole("button", { name: "Model: GPT-5" }))
  fireEvent.click(screen.getByRole("option", { name: /o3/ }))

  try {
    const picker = screen.getByRole("button", { name: "Model: GPT-5" })
    assert.equal(picker.hasAttribute("disabled"), true)
  } finally {
    acceptModel?.()
  }
})

test("model picker keeps the snapshot model after a rejected change", async () => {
  const client = createMockPrimeAgentClient()
  client.setModel = async () => {
    throw new Error("Prime Agent rejected the model")
  }
  renderChatShell(client)
  await screen.findByRole("heading", { name: "Build the chat workspace" })
  fireEvent.click(await screen.findByRole("button", { name: "Model: GPT-5" }))
  fireEvent.click(screen.getByRole("option", { name: /o3/ }))

  const alert = await screen.findByRole("alert")
  assert.match(alert.textContent ?? "", /Prime Agent rejected the model/)
  const picker = screen.getByRole("button", { name: "Model: GPT-5" })
  assert.equal(picker.hasAttribute("disabled"), false)
})

// @lat: [[tests#Behavior specifications#Renderer behavior#Activity document order]]
test("session activity follows the conversation in document order", async () => {
  renderChatShell()
  await screen.findByRole("heading", { name: "Build the chat workspace" })
  const conversation = document.querySelector(".conversation-pane")
  const inspector = screen.getByRole("complementary", { name: "Session activity" })
  assert.ok(conversation)
  assert.notEqual(
    conversation.compareDocumentPosition(inspector) & Node.DOCUMENT_POSITION_FOLLOWING,
    0,
  )
})

test("existing sessions show pending creation feedback", async () => {
  const client = createMockPrimeAgentClient()
  const createSession = client.createSession.bind(client)
  let continueCreation: (() => void) | undefined
  client.createSession = async (request) => {
    await new Promise<void>((resolve) => {
      continueCreation = resolve
    })
    return createSession(request)
  }
  renderChatShell(client)
  fireEvent.click(await screen.findByRole("button", { name: "New conversation" }))

  try {
    assert.ok(await screen.findByText("Creating conversation…"))
  } finally {
    continueCreation?.()
  }
})

test("existing sessions keep creation failures visible", async () => {
  const client = createMockPrimeAgentClient()
  client.createSession = async () => {
    throw new Error("Prime Agent daemon rejected the session")
  }
  renderChatShell(client)
  fireEvent.click(await screen.findByRole("button", { name: "New conversation" }))

  assert.ok(await screen.findByRole("alert"))
  assert.ok(screen.getByText("Prime Agent daemon rejected the session"))
  assert.equal(screen.getByRole("button", { name: "New conversation" }).hasAttribute("disabled"), false)
})

test("session activity announces run, queue, tool, and child changes", async () => {
  const client = createMockPrimeAgentClient()
  const [session] = await client.listSessions()
  assert.ok(session)
  const { snapshot } = await client.attachSession({ sessionId: session.id })
  render(
    <SessionInspector
      snapshot={{
        ...snapshot,
        session: { ...snapshot.session, state: "working" },
        useful: {
          ...snapshot.useful,
          state: {
            ...snapshot.useful.state,
            activeToolNames: ["bash"],
            sessionActions: {
              ...snapshot.useful.state.sessionActions,
              active: { kind: "turn", label: "Reviewing changes", phase: "running" },
              queuedCount: 2,
            },
          },
          children: [{
            id: "child-1",
            label: "Type checker",
            sessionDir: "/tmp/type-checker",
            status: "running",
            activity: { kind: "executing", toolName: "TypeScript" },
          }],
        },
      }}
    />,
  )

  const announcement = screen.getByRole("status", { name: "Session activity update" })
  assert.equal(announcement.getAttribute("aria-live"), "polite")
  assert.equal(announcement.getAttribute("aria-atomic"), "true")
  assert.equal(
    announcement.textContent,
    "Reviewing changes. Running the turn. 2 follow-ups queued. Active tool: bash. Type checker: Using TypeScript.",
  )
})

test("model picker reflects the selected model", async () => {
  renderChatShell()
  await screen.findByRole("heading", { name: "Build the chat workspace" })
  const picker = await screen.findByRole("button", { name: "Model: GPT-5" })
  fireEvent.click(picker)
  const search = await screen.findByRole("textbox", { name: "Search models" })
  assert.ok(screen.getByRole("button", { name: "openai" }))
  fireEvent.change(search, { target: { value: "o3" } })
  assert.equal(screen.queryByRole("option", { name: /GPT-5/ }), null)

  fireEvent.click(screen.getByRole("option", { name: /o3/ }))
  await screen.findByRole("button", { name: "Model: o3" })
  assert.equal(screen.queryByRole("dialog", { name: "Model picker" }), null)
})

test("model picker filters models by company", async () => {
  renderChatShell()
  fireEvent.click(await screen.findByRole("button", { name: "Model: GPT-5" }))
  fireEvent.click(screen.getByRole("button", { name: "openai" }))
  assert.equal(screen.queryByRole("option", { name: /GPT-5/ }), null)
  assert.ok(screen.getByRole("option", { name: /Claude/ }))
})

test("new conversations open with an empty transcript state", async () => {
  renderChatShell()
  const originalSession = await screen.findByRole("button", {
    name: "Build the chat workspace",
  })
  await screen.findByText("I’m the local Prime Agent mock. Send a message and I’ll exercise Ernie’s real session boundary.")

  fireEvent.click(screen.getByRole("button", { name: "New conversation" }))
  await screen.findByRole("heading", { name: "What should we build in /workspace/ernie?" })
  assert.equal(document.querySelector("[data-composer-placement='hero']") !== null, true)
  assert.equal(
    screen.queryByText("I’m the local Prime Agent mock. Send a message and I’ll exercise Ernie’s real session boundary."),
    null,
  )

  fireEvent.click(originalSession)
  await screen.findByText("I’m the local Prime Agent mock. Send a message and I’ll exercise Ernie’s real session boundary.")
  assert.equal(screen.queryByRole("heading", { name: "What should we build in /workspace/ernie?" }), null)
  assert.equal(document.querySelector("[data-composer-placement='docked']") !== null, true)
})

// @lat: [[tests#Behavior specifications#Renderer behavior#Failed transport]]
test("a failed transport is visible and blocks new commands", async () => {
  const client = createMockPrimeAgentClient()
  const attachSession = client.attachSession.bind(client)
  client.attachSession = async (request) => {
    const envelope = await attachSession(request)
    return {
      ...envelope,
      snapshot: {
        ...envelope.snapshot,
        session: { ...envelope.snapshot.session, state: "working" },
        transport: { status: "failed", error: "Prime Agent connection failed" },
      },
    }
  }

  render(
    <PrimeAgentStateProvider
      client={client}
      getWorkspacePath={async () => "/workspace/ernie"}
    >
      <ChatWorkspace />
    </PrimeAgentStateProvider>,
  )

  await screen.findByRole("alert", { name: "" })
  assert.ok(screen.getByText("Prime Agent connection failed"))
  assert.ok(screen.getByText("Couldn’t reconnect to Prime Agent."))
  assert.equal(screen.getByRole("textbox", { name: "Message Prime Agent" }).hasAttribute("disabled"), true)
  assert.equal(screen.getByRole("button", { name: "Stop Prime Agent" }).hasAttribute("disabled"), true)
})
