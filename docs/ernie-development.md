# Ernie: a programmable desktop for durable agents

Ernie did not evolve in a straight line. It repeatedly expanded, became too literal, and rebuilt around a smaller idea.

| Period | Ernie's model | Decisive evidence |
| --- | --- | --- |
| August 7 | Electron client for Prime Agent | `f76d601` added RPC, runtime vendoring, and the first renderer. |
| August 7-8 | Worktree agent workbench | `e459645` added workspace discovery, tabs, and Agent navigation. |
| August 8-9 | Multi-project control surface | T3 and Herdr experiments added Spaces, sessions, independent runtimes, and subagent trees. |
| August 10 | Deliberate restart | `dabf6d9` removed 10,338 lines; `245729a` rebuilt around deep modules. |
| August 11-12 | Durable Agent desktop | Daemon ownership, persistent sessions, draft-first creation, skills, and focused Agent chat. |
| August 13 | Programmable client | `b731d34` introduced the plugin host; `a4b41b3` made UI extensions reversible. |
| August 13 | Runtime separated from interface | `45bcee8` added the Ernie daemon API; `a054be0` proved another client could consume it. |

The critical pattern is not that Ernie accumulated features:

> Ernie first exposed the runtime, then learned to hide it, then began making the interface replaceable.

Ernie's history is preserved as a sequence of additions and removals. The first Electron build quickly became a worktree workbench. The workbench became a multi-project shell. Spaces gained independent runtimes; sessions gained tabs; subagents gained hierarchies; execution gained increasingly precise presentation. Each change made the runtime more legible. Together, they made the interface resemble the machinery underneath it.

Then Ernie deleted more than ten thousand lines.

The second build started from a smaller boundary. Prime Agent would own execution, sessions, descendants, and durable state. Ernie would become a client of that system. The desktop could show a focused conversation without pretending the conversation was the whole Agent. Execution evidence remained available, but answers returned to the foreground. Drafts could exist before sessions. Agents could persist beyond the window used to direct them.

Plugins emerged after this separation, not before it. Once the runtime no longer depended on one interface, the interface could become replaceable. The first plugin host contributed commands and primary views. The next revision made those contributions reversible: disabling a plugin removed its interface, commands, and resources without destabilizing Ernie. The later daemon API and Lynx client pushed the same idea across a process boundary. One durable system could support more than one way of seeing and shaping the work.

Ernie is not fully plugin-customizable yet. The current API supports trusted built-in commands and primary views. Third-party code still needs signing, isolation, permissions, updates, and removal. "Everything through plugins" is the architectural destination. The commit history gives Ernie a credible path toward it.
