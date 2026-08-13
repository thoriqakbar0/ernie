# Ernie: a programmable desktop for durable agents

A command field is not neutral. It teaches us to compress intention into an instruction, submit it, and expect an immediate answer. A pencil permits another rhythm: wander, slip, pause, reconsider. Both are tools. Each makes some actions natural and others awkward. With enough use, that difference becomes a way of thinking.

Agent interfaces make the same choice at a larger scale. They decide whether work appears as a sequence of answers or a continuing process. They decide whether delegation feels like a hidden implementation detail or a visible collaboration. They decide what interrupts us, what disappears, and what counts as finished. The interface does not merely display the agent. It trains the relationship between the person and the agent.

Ernie is an attempt to make that relationship programmable.

## The chat box was already an opinion

Ernie began as an Electron client for Prime Agent. The first build could start the runtime, exchange messages, stream responses, and expose native controls. It looked like a desktop application wrapped around an agent.

But Prime Agent does not behave like a chatbot. A root session owns a workspace, execution state, queued work, durable history, and child agents. It can continue after its client disconnects. Its conversation is important, but the conversation is only one view into a process with a longer life.

Putting that system behind a chat box made a strong claim: the important unit was the exchange happening now. Work that survived the exchange became secondary. Delegation became output. Runtime state became status chrome. Evidence became transcript material. The box did not only simplify the system. It taught the user how to understand it.

So Ernie expanded.

The early Electron client became a worktree agent workbench. The workbench became a multi-project shell. Spaces gained independent runtimes. Sessions gained tabs. Subagents gained hierarchies. Execution output gained increasingly precise presentation. T3 and Herdr supplied useful shapes for drafts, navigation, and focused work.

Every addition had a reason. Together, they made Ernie resemble the machinery underneath it.

This was another opinion disguised as an interface. If every runtime object receives a permanent representation, the user becomes its operator. The interface teaches supervision: watch the sessions, inspect the tree, follow the output, manage the branches. A system built to extend human agency can quietly turn the human into a monitor for the system.

## Removing the interface did not remove the lesson

On August 10, Ernie removed more than ten thousand lines of application code. The deletion was not a visual refresh. It ended the first model of the product.

The second build began with a stricter boundary. Prime Agent would own execution, sessions, descendants, and durable state. Ernie would be a client. The runtime could remain complex without requiring the interface to reproduce all of that complexity at once.

This changed the primary object. A conversation belonged inside an Agent; it was no longer the Agent's identity. A draft could exist before a session. An Agent could persist after its window closed. Execution evidence could remain available without competing with the answer. Workspaces could describe where work happened without becoming the permanent hierarchy through which all work had to be found.

The commit history records this change in small corrections. Ernie created Agents only after the first message. It made creation draft-first. It moved launch settings before the session. It built a focused Agent chat. It prioritized answers over execution detail. It removed redundant working indicators and compacted attention counts.

These changes were not only polish. Each one adjusted what Ernie trained the user to notice.

## Calm is also a constraint

A calm interface can become as prescriptive as a busy one. Hiding evidence may help one person think, while making another person distrust the system. A conversation-first surface may support direction, while an operator needs the live process tree. A compact composer may invite quick iteration, while a larger writing surface permits hesitation and careful framing.

There is no neutral default that resolves these differences forever.

This is where customization becomes more than theming. If tools shape behavior, changing colors and spacing is not enough. The user must be able to change what the tool considers primary. They need to alter views, commands, workflows, attention rules, and the boundaries between conversation and evidence.

Ernie's answer is a plugin architecture.

The first plugin host introduced versioned manifests, commands, and primary views. Its first substantial plugin was a browser with a native Electron lifecycle and a deliberately narrow security boundary. The next revision made interface contributions reversible. A plugin could register its own view, then be disabled without leaving commands, UI, or acquired resources behind. Ernie retained the recovery controls when a plugin failed.

That reversibility matters. A customizable tool is not truly programmable if one extension can permanently capture its interface. Disable is part of the architecture, not a settings convenience. It gives the user a path back.

The later Ernie daemon API extended the same separation across process boundaries. The Electron interface became one client of a durable system. A Lynx client could present the same Agents through another rendering technology. The experiment proved a larger point: the runtime does not need one canonical visual form.

## A desktop that can be argued with

Ernie is not fully plugin-native today. The current host supports trusted built-in commands and primary views. Third-party plugins still require signing, isolation, permissions, updates, and safe removal. Core surfaces still contain decisions that plugins cannot replace. "Everything through plugins" is an architectural direction, not a finished capability.

The direction matters because durable agents will shape more than individual commands. They will influence how work is divided, how often people intervene, what evidence they inspect, and what kinds of uncertainty remain visible. A fixed interface would encode one answer to all of those questions and repeat it until it felt natural.

A programmable desktop can make those answers contestable.

One person may build an interface that slows every consequential action and keeps uncertainty visible. Another may center artifacts and hide conversation. A team may define attention as approvals and failures only. A researcher may expose every branch and tool event. These are not skins over the same product. They are different working environments built over the same durable agent runtime.

We shape our tools, and our tools shape us. The purpose of Ernie's plugin architecture is not to escape that cycle. It is to let us remain inside it deliberately: able to inspect the environment we made, notice what it is making of us, and reshape it again.
