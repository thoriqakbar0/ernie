import { readFile, stat } from "node:fs/promises"
import path from "node:path"
import { Schema } from "effect"
import { SessionManager } from "prime-agent"
import type {
  PrimeRlmChild,
  PrimeSessionInspection,
  PrimeSessionSnapshot,
} from "../../packages/prime-agent"
import { projectSavedMessages } from "./projection"

type NativeIdentity = Readonly<{ sessionId: string; sessionFile?: string }>

const savedMetadata = Schema.Struct({
  childId: Schema.NonEmptyString,
  sessionFile: Schema.NonEmptyString,
  type: Schema.Literal("rlm_subagent"),
})

const inspectSavedChild = async (parent: NativeIdentity, child: PrimeRlmChild) => {
  const metadata = Schema.decodeUnknownSync(savedMetadata)(
    JSON.parse(await readFile(path.join(child.sessionDir, "rlm-subagent.json"), "utf-8")),
  )
  if (metadata.childId !== child.id || path.dirname(metadata.sessionFile) !== child.sessionDir) {
    throw new Error("The saved child identity does not match the native roster.")
  }
  await stat(metadata.sessionFile)
  const manager = SessionManager.open(metadata.sessionFile)
  const header = manager.getHeader()
  if (
    !parent.sessionFile ||
    !header ||
    header.parentSession !== parent.sessionFile ||
    !(header.rlmDepth && header.rlmDepth > 0)
  ) {
    throw new Error("The saved transcript does not belong to this parent.")
  }
  const inspection: PrimeSessionInspection = {
    messages: projectSavedMessages(manager.buildSessionContext().messages, manager.getSessionId()),
    name: manager.getSessionName(),
    sessionId: manager.getSessionId(),
    source: "saved",
  }
  return { inspection, sessionFile: metadata.sessionFile }
}

/** Resolves roster ancestry without treating node ids as durable native session ids. */
export const inspectNativeChild = async (input: {
  parent: NativeIdentity
  children: readonly PrimeRlmChild[]
  childId: string
  readLive: (activeSessionId: string) => Promise<PrimeSessionSnapshot>
}): Promise<PrimeSessionInspection> => {
  const roster = new Map(input.children.map((child) => [child.id, child]))
  if (roster.size !== input.children.length) {
    throw new Error(
      "The native child roster has ambiguous identities. Refresh it before inspecting.",
    )
  }
  let child = roster.get(input.childId)
  if (!child) {
    throw new Error("This child is not in the parent’s native roster.")
  }
  const ancestry: PrimeRlmChild[] = []
  const visited = new Set<string>()
  while (child) {
    if (visited.has(child.id)) {
      throw new Error("The native child ancestry is cyclic. Refresh it before inspecting.")
    }
    visited.add(child.id)
    ancestry.unshift(child)
    child = child.parentId ? roster.get(child.parentId) : undefined
  }
  const inspectNext = async (
    index: number,
    parent: NativeIdentity,
  ): Promise<PrimeSessionInspection> => {
    const descendant = ancestry[index]
    if (!descendant) {
      throw new Error("This child is not in the parent’s native roster.")
    }
    let result: PrimeSessionInspection
    let sessionFile: string | undefined
    if (descendant.activeSessionId) {
      const snapshot = await input.readLive(descendant.activeSessionId)
      // Missing ancestors cannot turn descendants into direct children: every edge must match.
      if (
        snapshot.useful.parent?.sessionId !== parent.sessionId ||
        snapshot.useful.parent.childId !== descendant.id
      ) {
        throw new Error(
          "The native child identity changed. Refresh the parent roster before inspecting it.",
        )
      }
      result = {
        messages: snapshot.messages,
        name: snapshot.session.name,
        sessionId: snapshot.session.id,
        snapshot,
        source: "live",
      }
      ;({ sessionFile } = snapshot.useful.state)
    } else {
      const saved = await inspectSavedChild(parent, descendant)
      result = saved.inspection
      ;({ sessionFile } = saved)
    }
    return index === ancestry.length - 1
      ? result
      : inspectNext(index + 1, { sessionFile, sessionId: result.sessionId })
  }
  return await inspectNext(0, input.parent)
}
