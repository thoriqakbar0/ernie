import assert from "node:assert/strict"
import { createServer } from "node:http"
import test from "node:test"
import { Schema } from "effect"
import { SendReceipts } from "../main/prime-agent/send-receipts"
import { createChatSession } from "../packages/chat-session"
import { SendRequest, SendReceipt } from "../packages/prime-agent"

// @lat: [[tests#Behavior specifications#Daemon boundary#Send receipt recovery]]
test("chat recovery crosses a dropped HTTP response without repeating delivery", async (t) => {
  let ledger = new SendReceipts()
  let loseResponse = false
  let rejectPreparation = false
  let loseNativeAck = false
  const deliveries: SendRequest[] = []
  const server = createServer((request, response) => {
    const handle = async () => {
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      if (request.url === "/epoch") { response.end(JSON.stringify(ledger.epoch)); return }
      const send = Schema.decodeUnknownSync(SendRequest)(JSON.parse(Buffer.concat(chunks).toString()))
      const receipt = await ledger.send(send, async () => {
        if (rejectPreparation) throw new Error("fixture disconnected before dispatch")
        return async () => {
          deliveries.push(send)
          if (loseNativeAck) throw new Error("fixture accepted without acknowledgement")
          return { status: send.mode === "prompt" ? "accepted" : "queued" }
        }
      })
      if (loseResponse) { response.destroy(); return }
      response.end(JSON.stringify(receipt))
    }
    void handle().catch(() => { response.statusCode = 500; response.end() })
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  t.after(() => new Promise<void>((resolve, reject) => { server.closeAllConnections(); server.close((error) => error ? reject(error) : resolve()) }))
  const address = server.address()
  assert.ok(address && typeof address !== "string")
  const url = `http://127.0.0.1:${address.port}`
  const client = {
    getSendEpoch: async () => Schema.decodeUnknownSync(Schema.NonEmptyString)(await (await fetch(`${url}/epoch`)).json()),
    sendMessage: async (request: SendRequest) => Schema.decodeUnknownSync(SendReceipt)(await (await fetch(url, { method: "POST", body: JSON.stringify(request) })).json()),
    abort: async () => {},
    waitForIdle: async () => {},
  }
  let nextId = 0
  const chat = createChatSession({ primeAgent: client, sessionId: "fixture-session", createId: () => `send-${++nextId}` })
  loseResponse = true
  assert.equal((await chat.submitDraft("first")).status, "unknown")
  assert.equal(deliveries.length, 1)
  loseResponse = false
  // A changed draft and runtime mode must not change the unresolved request.
  const recovered = await chat.followUp("later draft")
  assert.deepEqual(recovered, { status: "accepted", content: "first" })
  assert.equal(deliveries.length, 1)
  const queued = await Promise.all([chat.followUp("next"), chat.followUp("next")])
  assert.deepEqual(queued, [{ status: "queued", content: "next" }, { status: "queued", content: "next" }])
  assert.equal(deliveries.length, 2)
  assert.equal((await client.sendMessage({ ...deliveries[0], content: "changed identity" })).status, "unknown")
  rejectPreparation = true
  assert.equal((await chat.submitDraft("retry safely")).status, "not-sent")
  assert.equal(deliveries.length, 2)
  rejectPreparation = false
  assert.equal((await chat.submitDraft("retry safely")).status, "accepted")
  loseNativeAck = true
  assert.equal((await chat.submitDraft("uncertain native send")).status, "unknown")
  loseNativeAck = false
  assert.equal((await chat.submitDraft("uncertain native send")).status, "unknown")
  assert.equal(deliveries.length, 4)
  ledger = new SendReceipts()
  assert.equal((await chat.submitDraft("uncertain native send")).status, "unknown")
  assert.equal(deliveries.length, 4)
  chat.releaseUncertainSend()
  assert.equal((await chat.submitDraft("explicit new send")).status, "accepted")
  assert.equal(deliveries.length, 5)
})
