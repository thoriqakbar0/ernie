# Ernie: a programmable desktop for durable agents

A pencil and a command field can both begin with an empty space. They do not offer the same emptiness.

The pencil permits wandering. A line can slip. A thought can remain unfinished in the margin. The marks retain the order and pressure of their making. The command field asks for something more definite. Type the instruction, submit it, and wait for the result. Its shape suggests immediacy, certainty, judgment, and predictability.

Neither tool determines what a person will think. Each makes some forms of thought easier to sustain.

This is what tools do. They extend an ability, then reorganize behavior around the extension. The car extends the distance a person can travel, then cities reorganize around roads, parking, fuel, and commuting. The screen makes information fluid and abundant, then fills the small pauses that once existed between activities. The notification makes remote events immediately visible, then teaches us that visibility deserves attention.

We shape the tool. The tool changes the environment. The environment shapes us.

## Software is an environment

It is easy to treat an interface as a thin presentation layer over the real system. The database, protocol, model, or runtime appears to contain the serious engineering. The interface merely exposes it.

But people do not inhabit protocols. They inhabit the choices made visible through an interface.

A feed says that newness matters. An unread badge turns communication into debt. Infinite scroll removes the natural moment to stop. Autosave makes revision cheap. Version control makes divergence recoverable. A blank document asks what you want to make; a template asks which existing shape your work resembles.

These effects rarely arrive as explicit instructions. The tool does not announce that it is teaching a tempo, a hierarchy, or a theory of completion. Its defaults repeat until they become expectations. Eventually, an interface can feel intuitive when it is only familiar.

That familiarity has value. Conventions let people act without relearning every surface. Yet every convention contains an assumption about what the user knows and what the user is trying to do. Simplicity for one person can conceal necessary control from another. A tool designed for speed can make hesitation feel like failure. A tool designed for calm can make important machinery difficult to inspect.

There is no neutral interface. There are only decisions whose consequences have become quiet.

## AI changes the scale of the decision

The familiar chat box has become the default interface for artificial intelligence. It gives an unfamiliar system a learned social shape: write a message, receive a response, continue the exchange.

For many tasks, that shape works. It also carries an opinion. The important unit is the current exchange. The model waits for the person. The answer is the product. Progress appears as language.

Agents break those assumptions. An agent can retain an objective, use tools, modify files, delegate work, wait for external events, and continue after its interface disconnects. Its useful life may exceed one conversation and one window. The answer may be less important than the artifact, decision, or changed system it leaves behind.

Putting this process behind a chat box does not merely simplify it. It teaches the user to understand autonomous work as a sequence of replies. Delegation becomes output. Evidence becomes transcript material. Long-running state becomes a status indicator. The person remains positioned as a conversational partner even when the system increasingly behaves like a working environment.

Other interfaces teach other relationships. A dashboard teaches supervision. A kanban board teaches state transition. An IDE teaches inspection and direct manipulation. A notification queue teaches intervention. Each may reveal something the others hide. None deserves to become the permanent shape of agentic work by accident.

## Ernie as one response

Ernie began as an Electron client for Prime Agent. Prime Agent does not behave like a chatbot. A root session owns a workspace, execution state, queued work, durable history, and child agents. It can continue after its client disconnects. Conversation matters, but conversation is only one view into a longer process.

The first version of Ernie tried to make that process legible. It became a worktree agent workbench, then a multi-project shell. Spaces gained independent runtimes. Sessions gained tabs. Subagents gained hierarchies. Execution output gained increasingly precise presentation. Each addition had a reason. Together, they made the interface resemble the machinery underneath it.

The resulting tool taught supervision. Watch the sessions. Inspect the tree. Follow the output. Manage the branches. A system built to extend human agency had positioned the human as its operator.

On August 10, Ernie removed more than ten thousand lines of application code. The deletion ended that model of the product.

The second build began with a stricter boundary. Prime Agent would own execution, sessions, descendants, and durable state. Ernie would be a client. The runtime could remain complex without requiring the interface to reproduce all of it at once.

This changed what Ernie trained the user to notice. A conversation belonged inside an Agent; it was no longer the Agent's identity. A draft could exist before a session. An Agent could persist after its window closed. Evidence could remain available without competing with the result. Workspaces could describe where work happened without becoming the permanent hierarchy through which all work had to be found.

But a calmer default did not solve the underlying problem. Calm is also an opinion.

Hiding evidence may help one person think while making another distrust the system. A conversation-first surface may support direction while an operator needs a live process tree. A compact composer may invite iteration while a larger writing surface permits hesitation and careful framing. No single interface can resolve these differences forever.

## Programmability beyond appearance

If tools shape behavior, customization cannot end with colors and spacing. People need to change what the tool considers primary. They need to alter views, commands, workflows, attention rules, and the boundary between conversation and evidence.

This is the purpose of a plugin architecture. It moves interface decisions from permanent product law into replaceable components.

Ernie's first plugin host introduced versioned manifests, commands, and primary views. Its first substantial plugin was a browser with a native Electron lifecycle and a deliberately narrow security boundary. The next revision made interface contributions reversible. A plugin could register its own view, then be disabled without leaving commands, UI, or acquired resources behind. The host retained recovery controls when a plugin failed.

Reversibility matters beyond Ernie. A programmable tool is not meaningfully programmable if an extension can permanently capture it. Installation must have a corresponding removal. Activation must have cleanup. Contribution must have containment. A person needs a reliable path back before experimentation can feel safe.

The later Ernie daemon API separated the durable system from any one visual client. Electron became one possible interface. A Lynx experiment presented the same Agents through another rendering technology. The runtime did not need a canonical visual form.

Ernie is not fully plugin-native today. Its current host supports trusted built-in commands and primary views. Third-party plugins still require signing, isolation, permissions, updates, and safe removal. Core surfaces still contain decisions that plugins cannot replace. "Everything through plugins" remains an architectural direction.

## Tools we can argue with

Durable agents will shape more than individual commands. They will influence how work is divided, how often people intervene, what evidence they inspect, what uncertainty remains visible, and what they begin to treat as effortless. A fixed interface would encode one answer to those questions and repeat it until it felt natural.

A programmable interface can make those answers contestable.

One person may build an environment that slows every consequential action and keeps uncertainty visible. Another may center artifacts and hide conversation. A team may define attention as approvals and failures only. A researcher may expose every branch and tool event. These are not skins over the same product. They are different working environments over the same underlying capability.

The principle reaches beyond agent desktops. Every tool creates an environment, and every environment favors particular ways of moving through the world. We cannot avoid being shaped by what we make. We can notice the shaping. We can preserve alternatives. We can build exits, extensions, and points of revision into the tool itself.

We shape our tools, and our tools shape us. The goal of programmability is not to escape that cycle. It is to remain inside it deliberately: able to inspect the environment we made, recognize what it is making of us, and reshape it again.
