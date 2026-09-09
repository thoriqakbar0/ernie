const api = window.ernieHistory
const status = document.querySelector("#status")
const list = document.querySelector("#list")
const detail = document.querySelector("#detail")
const more = document.querySelector("#more")
let cursor = null
let currentId = null
let previousListenerController
const origins = {
  baseline: "Initial app",
  before_restore: "Before restore",
  customization: "Ernie customization",
  external: "External changes",
  launch: "Changes found on launch",
  manual: "Manual checkpoint",
  official_update: "Official update",
}
const element = (tag, text) => {
  const node = document.createElement(tag)
  node.textContent = text
  return node
}
const request = async (input) => {
  const result = await api.request(input)
  if (!result.ok) {
    throw new Error(`${result.error.message} ${result.error.nextAction || ""}`)
  }
  return result.value
}
const historyUI = {
  inspect: (item, proposed) => {
    detail.hidden = false
    detail.replaceChildren(element("h2", item.title))
    detail.focus()
    detail.append(
      element(
        "p",
        `Complete source checkpoint · ${item.fileCount} captured files. ${item.knownWorking ? "Startup readiness completed; individual features were not verified." : "Startup has not been checked for this checkpoint."}`,
      ),
    )
    if (item.proposedTitle) {
      detail.append(
        element(
          "p",
          "The title is an editing-client suggestion. The changed-file inventory comes from the controller; registration does not prove authorship.",
        ),
      )
    }
    const technical = element("details", "")
    technical.append(element("summary", "Technical details"))
    const changes = element("div", "")
    technical.append(changes)
    const preview = element("div", "")
    technical.append(preview)
    let next
    const read = async () => {
      try {
        const diff = await request({
          checkpointId: item.id,
          method: "history.diff",
          ...(next ? { cursor: next } : {}),
        })
        for (const file of diff.items) {
          const button = element("button", `${file.change}: ${file.path}`)
          const show = async (expectedTree, offset = 0) => {
            try {
              const content = await request({
                checkpointId: item.id,
                expectedTree,
                method: "history.diff",
                offset,
                path: file.path,
              })
              preview.replaceChildren(element("pre", JSON.stringify(content, null, 2)))
              const nextOffset = content.before?.nextOffset ?? content.current?.nextOffset
              if (nextOffset !== null && nextOffset !== undefined) {
                const nextPage = element("button", "Next source page")
                nextPage.addEventListener("click", () => show(content.currentTree, nextOffset))
                preview.append(nextPage)
              }
            } catch (error) {
              status.textContent = error.message
            }
          }
          button.addEventListener("click", () => show())
          changes.append(button)
        }
        next = diff.cursor
        if (next) {
          const button = element("button", "More changed files")
          button.addEventListener("click", async () => {
            button.remove()
            await read()
          })
          changes.append(button)
        }
      } catch (error) {
        status.textContent = error.message
      }
    }
    void read()
    detail.append(technical)
    const actions = element("div", "")
    actions.className = "actions"
    const keep = element("button", item.kept ? "Stop keeping" : "Keep checkpoint")
    keep.addEventListener("click", async () => {
      try {
        await request({ checkpointId: item.id, kept: !item.kept, method: "history.keep" })
        item.kept = !item.kept
        keep.textContent = item.kept ? "Stop keeping" : "Keep checkpoint"
        await historyUI.load()
      } catch (error) {
        status.textContent = error.message
      }
    })
    const restore = element("button", "Review restore")
    restore.disabled = !item.restorable
    restore.addEventListener("click", async () => {
      restore.disabled = true
      let timer
      try {
        status.textContent = "Preparing restore…"
        const proposal =
          proposed ??
          (await request({
            checkpointId: item.id,
            method: "history.prepare_restore",
            requestId: crypto.randomUUID(),
          }))
        let polling = false
        timer = setInterval(async () => {
          if (polling) {
            return
          }
          polling = true
          try {
            const progress = await request({
              method: "history.operation_status",
              operationId: proposal.id,
            })
            status.textContent = `Restore: ${progress.state.replaceAll("_", " ")}`
          } catch (error) {
            status.textContent = error.message
          } finally {
            polling = false
          }
        }, 750)
        const result = await api.approve(proposal.id)
        if (!result.ok) {
          throw new Error(result.error?.message || "Restore cancelled.")
        }
        clearInterval(timer)
        await historyUI.load()
        status.textContent = "Restored checkpoint. Return to previous state is available."
      } catch (error) {
        status.textContent = error.message
      } finally {
        clearInterval(timer)
        restore.disabled = false
      }
    })
    actions.append(keep, restore)
    detail.append(actions)
    if (!item.restorable) {
      detail.append(element("p", `Restoration is unavailable: ${item.reason}`))
    }
  },
  load: async (append = false) => {
    try {
      document.querySelector("#startup").textContent = await api.hostStatus()
      const health = await request({ method: "history.status" })
      currentId = health.currentCheckpointId
      const result = await request({
        method: "history.list",
        ...(append && cursor ? { cursor } : {}),
      })
      if (!append) {
        list.replaceChildren()
      }
      for (const item of result.items) {
        const row = element("li", "")
        const button = element("button", item.title)
        button.append(
          element(
            "small",
            `${new Date(item.createdAt).toLocaleString()} · ${origins[item.origin]} · ${item.changedFileCount} changed files${item.id === currentId ? " · Current" : ""}${item.knownWorking ? " · Startup checked" : ""}`,
          ),
        )
        button.addEventListener("click", () => historyUI.inspect(item))
        row.append(button)
        list.append(row)
      }
      ;({ cursor } = result)
      more.hidden = !cursor
      if (health.captureError) {
        status.textContent = health.captureError.message
      } else if (health.unsavedChanges) {
        status.textContent = "Changes since last checkpoint"
      } else {
        status.textContent = "App source matches its saved checkpoint."
      }
      const previous = document.querySelector("#previous")
      previous.hidden = !health.lastRecoveryId
      previousListenerController?.abort()
      previousListenerController = new AbortController()
      previous.addEventListener(
        "click",
        async () => {
          try {
            await historyUI.inspect(
              await request({ checkpointId: health.lastRecoveryId, method: "history.inspect" }),
            )
          } catch (error) {
            status.textContent = error.message
          }
        },
        { signal: previousListenerController.signal },
      )
      const pending = document.querySelector("#pending")
      pending.replaceChildren()
      for (const operation of health.operations ?? []) {
        const row = element("p", `Customization still active: ${operation.id}`)
        const finish = element("button", "Resolve editing interval")
        finish.addEventListener("click", async () => {
          try {
            const finishResult = await api.finish(operation.id)
            if (!finishResult.ok) {
              throw new Error(finishResult.error.message)
            }
            await historyUI.load()
          } catch (error) {
            status.textContent = error.message
          }
        })
        row.append(finish)
        pending.append(row)
      }
      for (const generation of health.inactiveGenerations ?? []) {
        if (generation.changed) {
          pending.append(
            element(
              "p",
              `Edits were observed in an inactive generation: ${generation.path}. They have not been merged into the current app.`,
            ),
          )
        }
      }
      for (const proposal of health.pendingProposals) {
        const button = element("button", "Review requested restore")
        button.addEventListener("click", async () => {
          try {
            await historyUI.inspect(
              await request({ checkpointId: proposal.checkpointId, method: "history.inspect" }),
              proposal,
            )
          } catch (error) {
            status.textContent = error.message
          }
        })
        pending.append(button)
      }
    } catch (error) {
      status.textContent = error.message
    }
  },
}
more.addEventListener("click", () => historyUI.load(true))
document.querySelector("#refresh").addEventListener("click", () => historyUI.load())
document.querySelector("#retry").addEventListener("click", async () => {
  const result = await api.reopen()
  status.textContent = result.ok ? "Ernie reopened." : result.error.message
})
document.querySelector("#save").addEventListener("click", async () => {
  try {
    await request({
      method: "history.checkpoint",
      requestId: crypto.randomUUID(),
      title: "Manual checkpoint",
    })
    await historyUI.load()
  } catch (error) {
    status.textContent = error.message
  }
})
void historyUI.load()
