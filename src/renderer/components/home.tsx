import { useRpc } from "@zenbujs/core/react"
import { useState } from "react"

/** Renders the fresh Ernie starter and its example RPC interaction. */
export function Home() {
  const rpc = useRpc()
  const [cwd, setCwd] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadCwd() {
    setCopied(false)
    setError(null)

    try {
      setCwd(await rpc.app.cwd.get())
    } catch {
      setError("Ernie could not read the working directory.")
    }
  }

  async function copyCwd() {
    if (cwd === null) return

    setError(null)

    try {
      await navigator.clipboard.writeText(cwd)
      setCopied(true)
    } catch {
      setError("Ernie could not copy the working directory.")
    }
  }

  return (
    <main className="flex-1 px-8 pt-6 pb-8 font-sans text-zinc-900 dark:text-zinc-100">
      <h1 className="text-2xl font-bold mb-2">Ernie</h1>
      <p className="text-zinc-500 dark:text-zinc-400 mb-6">
        A fresh start with Zenbu.js.
      </p>

      <button
        className="bg-indigo-600 hover:bg-indigo-700 transition text-white font-semibold px-4 py-2 rounded text-sm"
        onClick={() => void loadCwd()}
      >
        Get cwd
      </button>

      {cwd && (
        <div className="mt-3 flex items-center gap-2 max-w-md">
          <code className="flex-1 p-2 rounded bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 text-xs truncate">
            {cwd}
          </code>
          <button
            className="bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 px-3 py-2 rounded text-xs"
            onClick={() => void copyCwd()}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      )}

      {error && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </main>
  )
}
