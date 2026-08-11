# Design QA

## Reference

- Source: repository and conversation sidebar screenshot supplied by Thoriq.
- Review surface: the running Ernie Electron window at 1360 by 900 pixels.

## Electron comparison

- The sidebar uses the same repository-first hierarchy as the reference.
- Agent conversations appear directly beneath their repository.
- The active conversation uses one quiet rounded selection surface.
- Repository, filter, and add controls stay compact and visible.
- Conversation timestamps align at the trailing edge.
- The local Agent identity and settings control stay anchored in the footer.
- Long repository and conversation labels truncate instead of widening the sidebar.
- The main task composer remains visually separate from navigation.

## Runtime verification

- Prime Agent starts automatically when the existing daemon is unavailable.
- Existing live Agent conversations populate after Electron starts.
- The Electron development session reports no renderer or daemon startup errors.

final result: passed
