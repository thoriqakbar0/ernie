import { useEffect, useState } from "react";
import type { DevServerSnapshot } from "../../../../shared/devServer";

const EMPTY_SNAPSHOT: DevServerSnapshot = { revision: 0, updatedAt: new Date(0).toISOString(), servers: [] };

/** Usable, loopback-only browser launcher backed by main-process listener discovery. */
export function DevServerPanel({ open, worktreeId, worktreeLabel, onClose }: { readonly open: boolean; readonly worktreeId: string; readonly worktreeLabel: string; readonly onClose: () => void }) {
  const [snapshot, setSnapshot] = useState<DevServerSnapshot>(EMPTY_SNAPSHOT);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");

  const refresh = async () => {
    setState("loading");
    setSnapshot(EMPTY_SNAPSHOT);
    setMessage("");
    try {
      setSnapshot(await window.ernie.refreshDevServers(worktreeId));
      setState("idle");
    } catch {
      setState("error");
      setMessage("Unable to discover local development servers.");
    }
  };

  useEffect(() => {
    if (!open) return;
    void refresh();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose, worktreeId]);

  const openServer = async (port: number, url: string) => {
    setMessage("");
    try {
      const result = await window.ernie.openDevServer(worktreeId, port, url);
      if (!result.ok) setMessage(result.error ?? "Unable to open the local development server.");
    } catch {
      setMessage("Unable to open the local development server.");
    }
  };

  if (!open) return null;
  return <aside id="dev-server-panel" className="dev-server-panel" aria-label="Browser and local development servers">
    <header className="dev-server-heading">
      <div><h2>Browser</h2><p title={worktreeLabel}>Development servers for {worktreeLabel}</p></div>
      <button type="button" onClick={onClose} aria-label="Close browser panel">×</button>
    </header>
    <div className="dev-server-actions">
      <button type="button" onClick={() => void refresh()} disabled={state === "loading"}>{state === "loading" ? "Scanning…" : "Refresh"}</button>
    </div>
    {message && <div className="dev-server-error" role="alert">{message}</div>}
    {state !== "loading" && snapshot.servers.length === 0 && !message && <div className="dev-server-empty">
      <strong>No local servers found</strong>
      <p>Start your development server, then refresh this panel.</p>
    </div>}
    <div className="dev-server-list" aria-live="polite">
      {snapshot.servers.map((server) => <article key={server.url} className="dev-server-card">
        <span className="dev-server-live" aria-hidden="true" />
        <div><strong>{server.url.replace("http://", "")}</strong><small>Running from this worktree</small></div>
        <button type="button" onClick={() => void openServer(server.port, server.url)} disabled={state === "loading"}>Open</button>
      </article>)}
    </div>
    <p className="dev-server-footnote">Opens in your default browser. Ernie never embeds untrusted pages.</p>
  </aside>;
}
