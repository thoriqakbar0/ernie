# I built Ernie because I wanted to look cool

I started building Ernie for two reasons.

The first reason was that I wanted to look cool.

I wanted the kind of desktop application that makes a screenshot look like
work is happening in the future. Agents would continue running after I closed
the window. Their work would branch, persist, and return with evidence. I would
point at the interface and say something modest like, “this is my agent
harness,” as if I had not spent the previous hour moving one button four
pixels.

The second reason was an idea I could not leave alone: we shape our tools, then
our tools shape us.

These reasons were less separate than I expected.

That idea became both a reason and an alibi. If interfaces help shape our
habits, then the best UI has probably not happened yet. Every awkward button
can therefore look like a moral demand to start over.

Rebuilding feels decisive. It also ensures that no design remains in place
long enough to teach me what it does.

## A car eventually becomes a road

A car begins as a machine that lets a person travel farther. Then enough cars
exist, and the environment starts changing around them.

We build roads, parking spaces, traffic lights, petrol stations, wider
intersections, and suburbs separated by distances that assume a car will be
available. The tool changes the landscape. The new landscape makes the tool
more necessary. In many places, not having a car stops being a preference and
becomes a practical disadvantage.

The car did not merely extend movement. It helped decide what the environment
would expect from the people inside it.

The car is impressive. The sea of parking is the sequel.

Software does this quietly.

A feed says that newness deserves attention. An unread badge converts
communication into debt. Infinite scroll removes the natural moment to stop.
Autosave makes revision cheap. Version control makes divergence recoverable.
A blank document permits wandering. A command field asks for a decision.

None of these interfaces needs to announce its philosophy. The behavior
repeats until it feels natural.

Once I noticed this, every interface started to look less like a neutral
surface and more like a tiny zoning committee.

This is why I became interested in the shape of AI tools. The shape is not
decoration around the intelligence. It teaches us what the intelligence is
for.

## The chat box is already an opinion

The chat box has become the familiar shape of artificial intelligence. It
makes AI feel like an unusually patient person living inside a rectangle.
Write a message, receive a reply, continue the exchange.

For many tasks, this is useful. It also establishes a particular relationship.
The important unit is the current conversation. The model waits for the
person. Progress appears as language. The reply feels like the product.

Agents complicate that model.

An agent can retain an objective, use tools, modify files, delegate work, wait
for external events, and continue after its interface disconnects. Its useful
life may exceed one conversation and one window. The real result may be a
changed repository, a deployed system, or a decision supported by evidence.

If that system appears only through chat, we learn to understand durable work
as a sequence of replies. Delegation becomes transcript material. Execution
becomes a loading state. The person remains a conversational partner even when
the system has started behaving more like a working environment.

This is not necessarily wrong. It may simply be an early UI for agents, in the
same way an early road is a useful place to begin before someone invents the
roundabout and starts an argument.

I wanted to know what another environment would teach.

That became Ernie.

## Ernie accidentally became a control room

Ernie began as an Electron client for Prime Agent. Prime Agent owns durable
sessions, workspaces, execution state, queued work, and child agents. It can
continue after its visual client closes.

The first Ernie tried to make all of that machinery legible.

It gained a worktree workbench, then multiple projects. Sessions gained tabs.
Subagents gained hierarchies. Tool calls gained increasingly precise output.
Branches gained controls. Every addition solved a real problem.

Together, they taught me to supervise the system.

Watch the sessions. Inspect the tree. Follow the output. Manage the branches.
An application intended to extend human agency had assigned the human a new
job as its operator. I had invented a coworker and then accidentally applied
for the position of its air traffic controller.

On August 10, I used the standard interface-design technique of deleting the
interface.

One commit reported
[10,338 deletions](https://github.com/thoriqakbar0/ernie/commit/dabf6d974129ade57ee3633f266b562047d0c9ba).
Two minutes later, another reported
[12,824](https://github.com/thoriqakbar0/ernie/commit/63a757b7c2b93e32fe0342f4d65226772cb4399d).
Git therefore recorded 23,162 deleted lines across two commits.

That number does not prove the new design was better. It proves I had built
enough software to remove it in installments.

The deletion was useful. It returned the project to a boundary I could
understand. It also taught me a dangerous lesson: a clean slate feels unusually
intelligent because it contains no accumulated compromises. Unfortunately, it
also contains very little accumulated evidence.

The second Ernie began with a stricter boundary. Prime Agent would own the
durable work. Ernie would decide how a person encountered it. A conversation
could belong inside an Agent without becoming the Agent’s identity. Evidence
could remain available without competing with the result. The runtime could be
complex without requiring the interface to reproduce the complexity all at
once.

This version was smaller, calmer, and much easier to explain.

It was perhaps even becoming good.

Naturally, I replaced it with a much larger project.

## I forked the functioning adult

On August 13, I forked [bb](https://github.com/get-bb/bb), an agent IDE with a
server, host daemon, web application, desktop application, plugins, deployment
workflows, nightly releases, signing, and Apple notarization.

My smaller Ernie had questions. bb had packages.

I thought the larger project would make me look more serious and give me more
to learn. Both predictions were correct. I looked at an enormous amount of
serious software, looked extremely serious beside it, and learned that I could
not explain most of the decisions that now belonged to me.

For a short period, the bb fork carried the Ernie name. My standalone project
became Ernie Legacy. The new repository knew how to build itself, publish
itself, sign itself, and report what it had done.

Then Apple sent me a notarization notification.

Nothing had failed. A workflow had submitted a desktop build. Apple had
processed it. The system was doing exactly what it had been designed to do.

I still did not want the notification.

I had asked an AI to help build Ernie. Somewhere along the way, “build itself”
had expanded to include nightly publishing, release channels, signing,
deployment, and the administrative residue of operating a software product.

I was learning how to keep somebody else’s machine running.

This was valuable. It was also not the cool part I had imagined.

So I reversed the repositories again. The bb fork became
[`ernie-bb-archive`](https://github.com/thoriqakbar0/ernie-bb-archive). The
standalone project became [`ernie`](https://github.com/thoriqakbar0/ernie)
again.

GitHub records only one literal fork in this story. The first reversal happened
inside the product; the second happened between repositories. I still count
both. GitHub is technically correct and emotionally unhelpful.

By then, the pattern was becoming difficult to blame on GitHub. When a design
resisted me, I reached for a new foundation. I was studying how tools shape
behavior while quietly training myself to respond to friction by replacing the
tool.

## The harness is the part that shapes the work

A language model can produce text and request tools. It does not, by itself,
own a workspace, retain a loop, execute a command, remember a durable session,
ask for approval, reconnect after failure, or decide what evidence makes work
complete.

The software around the model gives those actions their shape. That surrounding
system is commonly called the harness.

The harness decides what the model can see, which tools it can use, how state
survives, when a person must intervene, and what appears in the interface. Two
products can use the same model and still create very different agents because
their harnesses teach different forms of work.

This was the layer I actually wanted to understand.

The larger projects remained useful once I stopped trying to become them.

[bb’s agent runtime](https://github.com/get-bb/bb/tree/75c3ea0311601d8e41d6e523d8e4848526e272d5/packages/agent-runtime)
showed me a practical provider boundary: the shared runtime owns lifecycle and
routing, while each provider adapter owns its specific protocol. A bridge
process is useful when a provider exposes an SDK but no stable wire protocol.
It is not architecture seasoning applied to every connection.

[DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness/tree/47f943859bef60e4160492346772ded9b24f765a)
made another decision unusually visible: everything is a plugin. Tools,
interfaces, and capabilities enter through extension points instead of
becoming permanent branches inside one central loop. The project is a
developer preview and explicitly warns that compatibility will break. For a
learner, those moving boundaries expose decisions that a mature product may
have already hidden.

The lesson was not to copy either architecture. I had already tested that
method.

The lesson was to inspect the boundaries they chose to own.

A fork can be a destination. It can also be a very elaborate way to borrow a
question.

## A tool should remain available for argument

Ernie now keeps its load-bearing path short enough for me to follow:

```text
renderer -> Electron IPC -> Ernie daemon -> Prime Agent adapter -> daemon socket
```

Prime Agent owns execution and durable state. Ernie owns the encounter.

That still leaves a dangerous amount of influence inside the interface. A calm
view can hide evidence. A detailed view can train constant supervision. A
compact composer can encourage quick iteration. A large writing surface can
permit hesitation. None of these choices is neutral, and none should become
permanent merely because I implemented it first.

This is why programmability cannot stop at colors and spacing. People need to
change what the tool considers primary: views, commands, workflows, attention
rules, and the boundary between conversation and evidence.

Ernie’s current plugin host is deliberately incomplete. It supports trusted
built-in commands and primary views. Its Browser plugin owns a native Electron
lifecycle and can be disabled without leaving its interface or acquired
resources behind. Arbitrary third-party plugins still require real isolation,
permissions, signing, updates, and safe removal.

I can name that missing work. This is one advantage of keeping the project
small.

The other advantage is that I can still change my mind without convening a
transport ministry.

A programmable tool does not free us from being shaped by tools. It makes the
shaping contestable. It gives us somewhere to disagree with a default, replace
an interface, or restore an earlier relationship with the system.

That possibility matters because the best UI has probably not happened yet.
We are still borrowing the shapes of chat, editors, terminals, dashboards, and
inboxes to meet systems that can act in unfamiliar ways. Some borrowed shapes
will survive. Some will become the AI equivalent of building a six-lane road
through the living room.

But an unfinished future does not automatically vote for another rewrite.

Cars did not shape cities because someone repeatedly prototyped one in a
garage. They shaped cities through use, repetition, infrastructure, and
lock-in. If I want to learn how Ernie shapes work, I have to use it long enough
for its defaults to become visible.

This is considerably less cinematic than deleting 23,162 lines.

I began Ernie because I wanted to look cool.

I still do. The screenshot matters. The object should feel inviting, strange,
and slightly ahead of me.

But now I know that the screenshot is also an argument about how work should
feel. Every control asks for a behavior. Every default repeats a value. Every
piece of hidden machinery teaches the person when to trust, watch, wait, or
intervene.

We shape the tool. The tool changes the environment. The environment shapes
us.

Ernie is my attempt to stay inside that loop deliberately, with enough access
to change the road while I am still learning where it leads.

Maybe the final Ernie will look nothing like the current one. Given the
evidence, it would be reckless to rule that out.

For now, the experiment may be to stop rebuilding it.

Keep the harness. Change one surface at a time. Use it for real work. Let a
choice become slightly annoying. Write down what the annoyance teaches. A
button that feels wrong after one hundred tasks is evidence. A button I imagine
might become wrong is mostly a hobby.

The best UI has probably not happened yet. Reaching it may require less
architecture and more patience.

It should still look cool, obviously.
