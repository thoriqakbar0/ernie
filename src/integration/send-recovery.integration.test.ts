import assert from "node:assert/strict"
import { once } from "node:events"
import { createServer } from "node:http"
import test from "node:test"
import { promisify } from "node:util"
import { Schema } from "effect"
import { SendReceipts } from "../main/prime-agent/send-receipts"
import { createChatSession } from "../packages/chat-session"
import { SendRequest, SendReceipt } from "../packages/prime-agent"

// @lat: [[tests#Behavior specifications#Daemon boundary#Send receipt recovery]]
test("chat recovery crosses a dropped HTTP response without repeating delivery", async (t) => {
  let ledger = new SendReceipts()
  let loseRequest = false
  let delayedRequest: SendRequest | undefined
  let loseResponse = false
  let rejectPreparation = false
  let loseNativeAck = false
  const deliveries: SendRequest[] = []
  const server = createServer((request, response) => {
    const handle = async () => {
      const chunks: Buffer[] = []
      for await (const chunk of request) {
        chunks.push(Buffer.from(chunk))
      }
      if (request.url === "/epoch") {
        response.end(JSON.stringify(ledger.epoch))
        return
      }
      const send = Schema.decodeUnknownSync(SendRequest)(
        JSON.parse(Buffer.concat(chunks).toString()),
      )
      if (loseRequest && request.url !== "/check") {
        delayedRequest = send
        response.destroy()
        return
      }
      const receipt =
        request.url === "/check"
          ? await ledger.check(send)
          : await ledger.send(send, () => {
              if (rejectPreparation) {
                return Promise.reject(new Error("fixture disconnected before dispatch"))
              }
              const dispatch = () => {
                deliveries.push(send)
                if (loseNativeAck) {
                  return Promise.reject(new Error("fixture accepted without acknowledgement"))
                }
                return Promise.resolve<SendReceipt>({
                  status: send.mode === "prompt" ? "accepted" : "queued",
                })
              }
              return Promise.resolve(dispatch)
            })
      if (loseResponse) {
        response.destroy()
        return
      }
      response.end(JSON.stringify(receipt))
    }
    void handle().catch(() => {
      response.statusCode = 500
      response.end()
    })
  })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  t.after(async () => {
    server.closeAllConnections()
    await promisify(server.close.bind(server))()
  })
  const address = server.address()
  assert.ok(address && typeof address !== "string")
  const url = `http://127.0.0.1:${address.port}`
  const client = {
    abort: async () => {},
    checkSend: async (request: SendRequest) => {
      const response = await fetch(`${url}/check`, {
        body: JSON.stringify(request),
        method: "POST",
      })
      return Schema.decodeUnknownSync(SendReceipt)(await response.json())
    },
    getSendEpoch: async () => {
      const response = await fetch(`${url}/epoch`)
      return Schema.decodeUnknownSync(Schema.NonEmptyString)(await response.json())
    },
    sendMessage: async (request: SendRequest) => {
      const response = await fetch(url, { body: JSON.stringify(request), method: "POST" })
      return Schema.decodeUnknownSync(SendReceipt)(await response.json())
    },
    waitForIdle: async () => {},
  }
  let nextId = 0
  const chat = createChatSession({
    createId: () => {
      nextId += 1
      return `send-${nextId}`
    },
    primeAgent: client,
    sessionId: "fixture-session",
  })
  loseResponse = true
  const first = await chat.submitDraft("first")
  assert.equal(first.status, "unknown")
  assert.equal(deliveries.length, 1)
  loseResponse = false
  // A changed draft and runtime mode must not change the unresolved request.
  const recovered = await chat.followUp("later draft")
  assert.deepEqual(recovered, { content: "first", status: "accepted" })
  assert.equal(deliveries.length, 1)
  const queued = await Promise.all([chat.followUp("next"), chat.followUp("next")])
  assert.deepEqual(queued, [
    { content: "next", status: "queued" },
    { content: "next", status: "queued" },
  ])
  assert.equal(deliveries.length, 2)
  const changedIdentity = await client.sendMessage({
    ...deliveries[0],
    content: "changed identity",
  })
  assert.equal(changedIdentity.status, "unknown")
  rejectPreparation = true
  const rejectedPreparation = await chat.submitDraft("retry safely")
  assert.equal(rejectedPreparation.status, "not-sent")
  assert.equal(deliveries.length, 2)
  rejectPreparation = false
  const retriedPreparation = await chat.submitDraft("retry safely")
  assert.equal(retriedPreparation.status, "accepted")
  loseNativeAck = true
  const uncertainNativeSend = await chat.submitDraft("uncertain native send")
  assert.equal(uncertainNativeSend.status, "unknown")
  loseNativeAck = false
  const unresolvedNativeSend = await chat.submitDraft("uncertain native send")
  assert.equal(unresolvedNativeSend.status, "unknown")
  assert.equal(deliveries.length, 4)
  ledger = new SendReceipts()
  const unresolvedAfterRestart = await chat.submitDraft("uncertain native send")
  assert.equal(unresolvedAfterRestart.status, "unknown")
  assert.equal(deliveries.length, 4)
  chat.releaseUncertainSend()
  const explicitNewSend = await chat.submitDraft("explicit new send")
  assert.equal(explicitNewSend.status, "accepted")
  assert.equal(deliveries.length, 5)
  loseRequest = true
  const lostRequest = await chat.submitDraft("request never received")
  assert.equal(lostRequest.status, "unknown")
  loseRequest = false
  const checkedLostRequest = await chat.followUp("newer text")
  assert.equal(checkedLostRequest.status, "not-sent")
  assert.equal(deliveries.length, 5)
  assert.ok(delayedRequest)
  const lateRequest = await client.sendMessage(delayedRequest)
  assert.equal(lateRequest.status, "not-sent")
  assert.equal(deliveries.length, 5)
  const explicitRetry = await chat.submitDraft("explicit retry")
  assert.equal(explicitRetry.status, "accepted")
  assert.equal(deliveries.length, 6)
})
