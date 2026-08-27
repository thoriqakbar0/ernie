import assert from "node:assert/strict"
import test from "node:test"

import { greet } from "../index"

test("greets through the package entry point", () => {
  assert.equal(greet(" ernie "), "hello, ernie!")
})
