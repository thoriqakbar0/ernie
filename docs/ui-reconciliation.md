# UI reconciliation review

The canonical UI branch is `thor/ernie-ui`, in `/Users/thor/work/.worktrees/ernie/ui`.

## Recovery points

Both snapshots include tracked edits and non-ignored untracked files. They are recovery snapshots, not verified releases.

| Source | Remote backup | Commit |
| --- | --- | --- |
| Canonical UI | `backup/ernie-ui-canonical-20260909` | `60ff0ee08daa45c83a6a7099f023a2e8923b971e` |
| Refinements | `backup/ernie-ui-refinements-20260909` | `e177d3ec3fb85da4340ed368c71dc721239c9c85` |

Ignored runtime data, credentials, dependencies, and local databases remain on disk; Git backups exclude them.

## Reconciliation decisions

- Preserve the newer agent, browser, annotation, and execution UI from commit `6caa255` and its local refinements.
- Preserve the canonical browser illustration.
- Use one ModelSettingsPopover and DepthSlider for draft and session settings. Reasoning remains a capability-driven dropdown; both inference controls use progressive disclosure.
- Restore sidebar rename, customize, favorites, and removal actions. Removing an agent retains native conversation files.
- Separate parent selection from the subagent-count disclosure.
- Remove DialKit and its unused direct Motion dependency. Preserve the original canonical lockfile; no runtime dependencies are upgraded.
- Keep default steering with an explicit Queue alternative. Honor the chosen delivery mode through form submission.
- Keep the app-owned default workspace for new chats; existing agent folders remain unchanged.
- Dispose both native keyboard listeners during service cleanup.

## Visual review

- [ ] Open model settings in both a new draft and an existing conversation.
- [ ] Expand reasoning/depth; inspect the rail, exact value, and narrow layout.
- [ ] Select an agent without expanding children; toggle children using the count.
- [ ] Open the row context menu using pointer and keyboard.
- [ ] Confirm the browser illustration and panel layout.
- [ ] Confirm the running app belongs to the canonical worktree.

Do not remove older worktrees until the canonical runtime is reviewed. They remain recovery material, not iteration targets.
