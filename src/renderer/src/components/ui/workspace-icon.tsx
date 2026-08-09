import type { ReactNode } from "react";

/** Names of the shared outline icons available to workspace surfaces. */
export type IconName = "archive" | "chevron" | "folder" | "close" | "folder-add" | "restore" | "search" | "sidebar-close" | "trash" | "worktree-add";

const ICON_PATHS: Record<IconName, ReactNode> = {
  archive: <><rect width="20" height="5" x="2" y="3" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8m-10 4h4" /></>,
  folder: <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />,
  search: <><path d="m21 21-4.35-4.35" /><circle cx="11" cy="11" r="8" /></>,
  chevron: <path d="m9 18 6-6-6-6" />,
  close: <path d="m6 6 8 8m0-8-8 8" />,
  "folder-add": <path d="M12 10v6m-3-3h6m5 7a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />,
  restore: <><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></>,
  "sidebar-close": <><rect x="2.5" y="2.5" width="15" height="15" rx="2" /><path d="M7.5 2.5v15m7-10-3 2.5 3 2.5" /></>,
  trash: <><path d="M10 11v6m4-6v6m5-11v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>,
  "worktree-add": <><path d="M6 3v12" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M15 6a9 9 0 0 0-9 9m12 0v6m3-3h-6" /></>,
};

/** Renders one decorative workspace icon with color inherited from its control. */
export function Icon({ name }: { readonly name: IconName }) {
  const usesLucideGrid = name !== "close" && name !== "sidebar-close";
  return <svg viewBox={usesLucideGrid ? "0 0 24 24" : "0 0 20 20"} aria-hidden="true" data-icon={name}>{ICON_PATHS[name]}</svg>;
}
