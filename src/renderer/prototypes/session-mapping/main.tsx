/** PROTOTYPE — Three React variants for multi-project session mapping, switchable via ?variant=. */
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./prototype.css";

type VariantKey = "A" | "B" | "C";
type SessionId = "mapping" | "review" | "oauth";
type ProjectId = "ernie" | "pai-bot" | "website";
type SessionStatus = "running" | "waiting" | "idle";

interface Session {
  readonly title: string;
  readonly project: ProjectId;
  readonly status: SessionStatus;
  readonly detail: string;
}

const sessions: Record<SessionId, Session> = {
  mapping: { title: "Session mapping", project: "ernie", status: "running", detail: "Building the multi-project navigator" },
  review: { title: "Review process cleanup", project: "ernie", status: "idle", detail: "Completed 18 min ago" },
  oauth: { title: "Fix OAuth callback", project: "pai-bot", status: "running", detail: "Running tests" },
};

const variantNames: Record<VariantKey, string> = { A: "Project tree", B: "Focused project", C: "Project spaces" };
const variantKeys: readonly VariantKey[] = ["A", "B", "C"];

function initialVariant(): VariantKey {
  const candidate = new URLSearchParams(window.location.search).get("variant")?.toUpperCase();
  return candidate === "B" || candidate === "C" ? candidate : "A";
}

function Icon({ kind }: { readonly kind: "folder" | "branch" | "plus" }) {
  if (kind === "folder") return <svg className="icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M2.8 5.5h5l1.5 1.7h7.9v7.7a1.6 1.6 0 0 1-1.6 1.6H4.4a1.6 1.6 0 0 1-1.6-1.6z" /><path d="M2.8 7.2v-2A1.6 1.6 0 0 1 4.4 3.6h2.7l1.7 1.9" /></svg>;
  if (kind === "branch") return <svg className="icon" viewBox="0 0 20 20" aria-hidden="true"><circle cx="6" cy="5" r="1.5" /><circle cx="14" cy="15" r="1.5" /><path d="M6 6.5v3.7a4.8 4.8 0 0 0 4.8 4.8h1.7M14 13.5V5" /></svg>;
  return <svg className="icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12" /></svg>;
}

function StatusDot({ status }: { readonly status: SessionStatus }) {
  return <span className={`status-dot ${status}`} aria-hidden="true" />;
}

function ActivityBar() {
  return <span className="activity-track" aria-label="Running"><i /></span>;
}

interface SharedProps {
  readonly activeSession: SessionId;
  readonly openTabs: readonly SessionId[];
  readonly openSession: (id: SessionId) => void;
}

function TabStrip({ activeSession, openTabs, openSession, closeTab }: SharedProps & { readonly closeTab: (id: SessionId) => void }) {
  return <div className="tabstrip" role="tablist" aria-label="Open sessions">
    {openTabs.map((id) => {
      const session = sessions[id];
      return <button key={id} type="button" role="tab" aria-selected={id === activeSession} className={`tab ${id === activeSession ? "active" : ""}`} onClick={() => openSession(id)}>
        <StatusDot status={session.status} />
        <span className="tab-label">{session.title} · {session.project}</span>
        <span className="close" role="button" aria-label={`Close ${session.title}`} onClick={(event) => { event.stopPropagation(); closeTab(id); }}>×</span>
      </button>;
    })}
  </div>;
}

function Content({ activeSession }: { readonly activeSession: SessionId }) {
  const session = sessions[activeSession];
  return <main className="content">
    <div className="map-strip"><span>{session.project}</span><span>›</span><b>{session.title}</b></div>
    <section className="conversation">
      <h1>{session.title}</h1>
      <p>{session.detail}. Closing this tab leaves the session running in the background and available from its project.</p>
      {session.status === "running" && <div className="run-card"><strong>Prime Agent is working</strong><ActivityBar /></div>}
    </section>
  </main>;
}

function SessionRow({ id, selected = false, nested = false, openSession }: { readonly id: SessionId; readonly selected?: boolean; readonly nested?: boolean; readonly openSession: (id: SessionId) => void }) {
  const session = sessions[id];
  return <div className={nested ? "subagent" : undefined}>
    <button type="button" className={`session-row ${selected ? "selected" : ""}`} onClick={() => openSession(id)}>
      <span className="session-top"><StatusDot status={session.status} /><strong>{session.title}</strong></span>
      <small>{session.detail}</small>
      {session.status === "running" && <ActivityBar />}
    </button>
  </div>;
}

function Project({ name, count, children, initiallyCollapsed = false }: { readonly name: string; readonly count: number; readonly children?: React.ReactNode; readonly initiallyCollapsed?: boolean }) {
  const [collapsed, setCollapsed] = useState(initiallyCollapsed);
  return <div className={`project ${collapsed ? "collapsed" : ""}`}>
    <button type="button" className="tree-button project-head" aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}>
      <span className="chev">⌄</span><Icon kind="folder" /><strong>{name}</strong><span className="count">{count}</span>
    </button>
    {!collapsed && <div className="project-body">{children}</div>}
  </div>;
}

function VariantA(props: SharedProps) {
  return <div className="shell">
    <aside className="sidebar">
      <div className="a-heading"><span>Projects</span><button type="button" className="add-project" aria-label="Open folder"><Icon kind="plus" /></button></div>
      <Project name="ernie" count={2}>
        <div className="worktree"><div className="worktree-head"><Icon kind="branch" /><span>main</span><span className="count">2</span></div>
          <SessionRow id="mapping" selected={props.activeSession === "mapping"} openSession={props.openSession} />
          <SessionRow id="review" selected={props.activeSession === "review"} openSession={props.openSession} />
          <div className="subagent"><div className="session-row"><span className="session-top"><StatusDot status="idle" /><strong>UI reviewer</strong></span><small>Subagent · completed</small></div></div>
        </div>
        <div className="worktree"><div className="worktree-head"><Icon kind="branch" /><span>feature/sidebar</span><span className="count">0</span></div></div>
      </Project>
      <Project name="pai-bot" count={1}>
        <div className="worktree"><div className="worktree-head"><Icon kind="branch" /><span>main</span><span className="count">1</span></div>
          <SessionRow id="oauth" selected={props.activeSession === "oauth"} openSession={props.openSession} />
        </div>
      </Project>
      <Project name="website" count={3} initiallyCollapsed />
    </aside>
    <Content activeSession={props.activeSession} />
  </div>;
}

function FocusSession({ id, selected, openSession }: { readonly id: SessionId; readonly selected: boolean; readonly openSession: (id: SessionId) => void }) {
  const session = sessions[id];
  return <button type="button" className={`b-session ${selected ? "selected" : ""}`} onClick={() => openSession(id)}>
    <span className="b-session-line"><StatusDot status={session.status} /><strong>{session.title}</strong></span>
    <small>{session.detail}</small>{session.status === "running" && <ActivityBar />}
  </button>;
}

function VariantB(props: SharedProps) {
  const [project, setProject] = useState<ProjectId>("ernie");
  return <div className="shell">
    <nav className="project-dock" aria-label="Projects">
      {(["ernie", "pai-bot", "website"] as const).map((id) => <button key={id} type="button" className={`project-tile ${project === id ? "active" : ""}`} title={id} onClick={() => setProject(id)}>{id === "ernie" ? "ER" : id === "pai-bot" ? "PB" : "WE"}</button>)}
      <button type="button" className="project-tile add" aria-label="Open folder">+</button>
    </nav>
    <aside className="sidebar">
      <div className="focus-title"><h2>{project}</h2><span>/Users/thor/work/{project}</span></div>
      {project === "ernie" ? <><div className="b-section"><div className="b-section-label">main · 2 sessions</div><FocusSession id="mapping" selected={props.activeSession === "mapping"} openSession={props.openSession} /><FocusSession id="review" selected={props.activeSession === "review"} openSession={props.openSession} /></div><div className="b-section"><div className="b-section-label">feature/sidebar</div><div className="muted" style={{ padding: 8, fontSize: 11 }}>No sessions</div></div></> : project === "pai-bot" ? <div className="b-section"><div className="b-section-label">main · 1 session</div><FocusSession id="oauth" selected={props.activeSession === "oauth"} openSession={props.openSession} /></div> : <div className="muted" style={{ padding: 8, fontSize: 11 }}>3 saved sessions</div>}
    </aside>
    <Content activeSession={props.activeSession} />
  </div>;
}

function VariantC(props: SharedProps) {
  return <div className="shell">
    <aside className="sidebar">
      <div className="open-label">Open sessions</div>
      {props.openTabs.map((id) => { const session = sessions[id]; return <button key={id} type="button" className={`open-session ${id === props.activeSession ? "selected" : ""}`} onClick={() => props.openSession(id)}><StatusDot status={session.status} /><span className="open-session-copy"><strong>{session.title}</strong><small>{session.project}</small>{session.status === "running" && <ActivityBar />}</span></button>; })}
      <div className="open-label" style={{ marginTop: 20 }}>Available in ernie</div>
      <button type="button" className="open-session" onClick={() => props.openSession("review")}><StatusDot status="idle" /><span className="open-session-copy"><strong>Review process cleanup</strong><small>main · 18 min ago</small></span></button>
    </aside>
    <Content activeSession={props.activeSession} />
  </div>;
}

function Prototype() {
  const [variant, setVariant] = useState<VariantKey>(initialVariant);
  const [openTabs, setOpenTabs] = useState<readonly SessionId[]>(["mapping", "oauth"]);
  const [activeSession, setActiveSession] = useState<SessionId>("mapping");

  const chooseVariant = (next: VariantKey) => {
    const url = new URL(window.location.href);
    url.searchParams.set("variant", next);
    window.history.replaceState({}, "", url);
    setVariant(next);
  };
  const cycle = (step: number) => {
    const index = variantKeys.indexOf(variant);
    chooseVariant(variantKeys[(index + step + variantKeys.length) % variantKeys.length] ?? "A");
  };
  const openSession = (id: SessionId) => {
    setActiveSession(id);
    setOpenTabs((tabs) => tabs.includes(id) ? tabs : [...tabs, id]);
  };
  const closeTab = (id: SessionId) => {
    setOpenTabs((tabs) => {
      const next = tabs.filter((candidate) => candidate !== id);
      if (id === activeSession) setActiveSession(next[0] ?? "mapping");
      return next;
    });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const focused = document.activeElement;
      if (focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement || focused?.getAttribute("contenteditable") === "true") return;
      if (event.key === "ArrowLeft") cycle(-1);
      if (event.key === "ArrowRight") cycle(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [variant]);

  const shared = { activeSession, openTabs, openSession };
  const body = variant === "A" ? <VariantA {...shared} /> : variant === "B" ? <VariantB {...shared} /> : <VariantC {...shared} />;
  const tabs = variant === "C"
    ? <div className="space-tabs"><button type="button" className="space-tab active">ernie</button><button type="button" className="space-tab">pai-bot</button><button type="button" className="space-tab">website</button><button type="button" className="space-tab">Open folder…</button></div>
    : <TabStrip {...shared} closeTab={closeTab} />;

  return <div className={`variant-${variant.toLowerCase()}`}>
    <div className="app"><header className="titlebar"><span className="brand">Ernie</span>{tabs}</header>{body}</div>
    <div className="prototype-switcher" aria-label="Prototype variants"><button type="button" aria-label="Previous variant" onClick={() => cycle(-1)}>←</button><span className="variant-label">{variant} — {variantNames[variant]}</span><button type="button" aria-label="Next variant" onClick={() => cycle(1)}>→</button></div>
    <div className="prototype-note">PROTOTYPE · data is illustrative</div>
  </div>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><Prototype /></StrictMode>);
