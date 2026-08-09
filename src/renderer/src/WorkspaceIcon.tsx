import type { ReactNode } from "react";

export type IconName = "chevron" | "close" | "folder-add" | "sidebar" | "sidebar-close" | "subagent-fork" | "subagent-network" | "subagent-waypoints" | "subagent-workflow";

const ICON_PATHS: Record<IconName, ReactNode> = {
  chevron: <path d="m9 18 6-6-6-6" />,
  close: <path d="m6 6 8 8m0-8-8 8" />,
  "folder-add": <path d="M12 10v6m-3-3h6m5 7a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />,
  sidebar: <><rect x="2.5" y="2.5" width="15" height="15" rx="2" /><path d="M7.5 2.5v15m4-10 3 2.5-3 2.5" /></>,
  "sidebar-close": <><rect x="2.5" y="2.5" width="15" height="15" rx="2" /><path d="M7.5 2.5v15m7-10-3 2.5 3 2.5" /></>,
  "subagent-fork": <><circle cx="12" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><circle cx="18" cy="6" r="3" /><path d="M18 9v2a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V9m6 3v3" /></>,
  "subagent-network": <><rect width="6" height="6" x="16" y="16" rx="1" /><rect width="6" height="6" x="2" y="16" rx="1" /><rect width="6" height="6" x="9" y="2" rx="1" /><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3m-7-4V8" /></>,
  "subagent-waypoints": <><path d="m10.6 5.4-5.2 5.2m13.2 2.8-5.2 5.2M6 12h12" /><circle cx="12" cy="20" r="2" /><circle cx="12" cy="4" r="2" /><circle cx="20" cy="12" r="2" /><circle cx="4" cy="12" r="2" /></>,
  "subagent-workflow": <><rect width="8" height="8" x="3" y="3" rx="2" /><path d="M7 11v4a2 2 0 0 0 2 2h4" /><rect width="8" height="8" x="13" y="13" rx="2" /></>,
};

export function Icon({ name }: { readonly name: IconName }) {
  const usesLucideGrid = name !== "close" && name !== "sidebar" && name !== "sidebar-close";
  return <svg viewBox={usesLucideGrid ? "0 0 24 24" : "0 0 20 20"} aria-hidden="true">{ICON_PATHS[name]}</svg>;
}

