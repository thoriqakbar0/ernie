import assert from "node:assert/strict"
import { test } from "node:test"

import { getWorkspaceName } from "../components/workspace-name"

test("extracts POSIX and Windows workspace names", () => {
  assert.equal(getWorkspaceName("/workspace/ernie"), "ernie")
  assert.equal(getWorkspaceName("/workspace/ernie/"), "ernie")
  assert.equal(getWorkspaceName("C:\\work\\ernie"), "ernie")
  assert.equal(getWorkspaceName("C:\\work\\ernie\\"), "ernie")
})

test("keeps root-like workspace paths intact", () => {
  assert.equal(getWorkspaceName("/"), "/")
  assert.equal(getWorkspaceName("C:\\"), "C:\\")
})
