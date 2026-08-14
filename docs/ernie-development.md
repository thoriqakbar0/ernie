# i wanted a cooler agent harness and accidentally built two (and forked one)

ernie began with a screenshot i wanted to exist. this was not an official
requirements document, but it had excellent visual coverage.

underneath the screenshot was a smaller and more stubborn requirement. i
wanted one task to keep its context while i passed it from my laptop into a
sandbox and back again. changing the execution environment should not have
meant starting the work’s story over. the repository, the decisions, and the
unfinished parts should still belong to the same task.

this was why i kept saying “server” and “daemon” before i could explain the
rest of the system. the architecture arrived as nouns. the server could own
the durable task. a daemon could translate that task into work inside each
environment. the context needed to live somewhere that neither my laptop nor a
temporary sandbox owned.

i also wanted a desktop app where agents could keep working after i closed the
window. sessions would stay attached to repositories, work would branch, and
the evidence would still be there when i came back. ideally, the app would look
cool enough that i could point at it and say “agent harness” without explaining
what i had been doing all week.

wanting to look cool is not the official reason people give for starting
software projects. it is, however, the reason i actually had.

there was a theory under that motive. tools do not remain passive for long.
people build a tool around one set of habits. the tool makes those habits
easier. eventually, the surrounding environment assumes everyone has adopted
them.

cars are the obvious example. a car lets one person travel farther. a city full
of cars needs roads, parking, traffic lights, petrol stations, wider
intersections, and buildings separated by car-sized distances. once that
environment exists, owning a car becomes less optional. the machine changed
the city, and the changed city made the machine necessary.

software can do this with less asphalt. an unread badge turns messages into
obligations. infinite scroll removes the point where you would have stopped. a
chat box teaches you to type something, wait, and read the reply.

i wondered what the usual chat box was teaching us about agents.

## maybe the interface should not know what it is yet

one task might need a graph. another might need a diff. eventually i will ask
for “the thing with the thingy,” because the work will have invented a
requirement faster than i invented a noun.

this is still a better product specification than making every kind of work
look like a chat.

a chat interface makes artificial intelligence easy to understand. there is a
conversation, the model answers, and the answer is the visible result. that
shape works until the system can keep an objective, modify files, use tools,
spawn more work, and continue after the window disappears.

then the transcript becomes one view of what happened, not the thing itself.
the durable object might be a repository change, a running process, or a task
waiting for approval. if the interface still puts the transcript at the
center, the person learns to watch the transcript.

my first ernie was an electron client for prime agent. prime agent already
owned durable sessions, workspaces, queued work, and child agents. ernie tried
to expose all of it.

i added a worktree workbench, project controls, session tabs, subagent trees,
tool output, and branch controls. every addition answered a real question.
together, they promoted the user to air traffic control.

i had built an agent system to reduce supervision, then built a cockpit for
supervising it. the loop was now visible in the interface.

on august 10, i tested a smaller design through subtraction. the first commit
reported
[10,338 deletions](https://github.com/thoriqakbar0/ernie/commit/dabf6d974129ade57ee3633f266b562047d0c9ba).
two minutes later, the second reported
[12,824 deletions](https://github.com/thoriqakbar0/ernie/commit/63a757b7c2b93e32fe0342f4d65226772cb4399d).
git recorded 23,162 deleted lines across the two commits.

this proved that i had built enough interface to require two trips to remove
it. whether the replacement was better remained unknown.

the smaller version drew a clearer boundary. prime agent would continue to own
execution and durable state. ernie would decide how a person encountered that
work. a conversation could live inside an agent without becoming the agent’s
identity. evidence could stay available without covering the screen at all
times.

the result was calmer and easier for me to explain. i celebrated by replacing
it with a much larger repository.

## the repository had already hired departments

on august 13, i forked [bb](https://github.com/get-bb/bb). bb is an agent ide
with a server, a host daemon, web and desktop applications, plugins, deployment
workflows, nightly releases, and signing.

my ernie had open questions. bb had departments.

for a short time, the bb fork took the ernie name and the smaller app became
ernie legacy. i opened the larger codebase looking for durable sessions and
host execution. both were there, already connected to web and desktop apps,
plugins, deployment, and releases.

the fork answered my questions, but it also changed the experiment. modifying
the harness meant learning which surrounding systems depended on it. i was no
longer testing one boundary in a small app. i was learning an entire product
before i could safely change it.

i wanted to understand the harness by building that boundary myself.

so the names changed again. the bb fork became
[ernie-bb-archive](https://github.com/thoriqakbar0/ernie-bb-archive), and the
standalone app became [ernie](https://github.com/thoriqakbar0/ernie) again.

github records one literal fork here. i count the earlier rebuild and the later
repository reversal as two attempts to replace the foundation. github’s
version is better for network graphs. mine explains the week.

## i wanted the harness parts, not the company

the fork was not wasted. it showed me which parts of a mature harness were
worth understanding separately from the machinery that publishes and operates
the product around it.

a model can produce text and request tools. it does not own a workspace, retain
a loop, reconnect after failure, ask for approval, or decide what evidence
makes a task complete. the harness supplies those rules. it determines what the
model can see, how actions run, where state survives, and when a person has to
intervene.

[bb’s agent runtime](https://github.com/get-bb/bb/tree/75c3ea0311601d8e41d6e523d8e4848526e272d5/packages/agent-runtime)
gave me a useful example of provider ownership. its shared runtime manages
lifecycle and routing. each provider adapter handles the provider’s protocol.
a separate bridge process appears when a provider offers an sdk but not a
stable wire protocol. the bridge solves that transport problem. it is not
there because the architecture diagram looked lonely.

[deepseek harness](https://github.com/deepseek-ai/DeepSeek-Harness/tree/47f943859bef60e4160492346772ded9b24f765a)
made a different boundary visible. tools, interfaces, and capabilities enter
through plugins instead of accumulating as permanent branches in one central
loop. the project calls itself a developer preview and warns that compatibility
will break. this is inconvenient if you need a stable dependency. it is useful
if you are trying to see which decisions are still moving.

i did not need ernie to become bb or deepseek harness. i needed to understand
why they placed certain responsibilities on opposite sides of a boundary.

ernie still does not make the environment handoff seamless. the
server-and-thingy language arrived before the implementation. the useful part
survived: durable task context should not belong to any one host daemon. work
should be able to leave my laptop, run inside a sandbox, and return without
either environment becoming the work itself.

ernie now has a short path from the interface to prime agent:

```text
renderer -> electron ipc -> ernie daemon -> prime agent adapter -> daemon socket
```

the ernie daemon presents one application boundary to electron. the prime
agent adapter owns prime agent’s identity, protocol, connection, and failure
translation. prime agent already provides a daemon socket, so adding a stdio
bridge would create another process for me to misunderstand.

## rebuilding is a very convincing form of progress

the best interface for agents probably has not happened yet. current products
borrow familiar shapes from chat, editors, terminals, inboxes, and dashboards
because people already know how to use them. agents can behave differently from
all five. some of those borrowed shapes will eventually look strange.

this makes experimentation reasonable. it also gives me a technically
interesting excuse to restart forever.

a clean project feels clear because it has no accumulated compromises. it also
has no accumulated evidence. if i replace an interface as soon as it resists
me, i never learn whether the problem appears during real work or only while i
am staring at the design.

cars changed cities because people kept driving them. they did not achieve
urban influence by remaining in a garage while their owner renamed the project
twice.

the next experiment is less dramatic. i need to keep the current runtime in
place, use ernie for actual work, and wait for the same friction to appear more
than once before replacing the surrounding surface. a button that becomes
annoying across a hundred tasks is evidence. a button i suspect might annoy me
later is an interesting way to lose an afternoon.

i still want ernie to look cool. that motive survived all the architecture.
appearance affects whether a tool feels inviting, whether i want to return to
it, and whether the work feels like mine. i just no longer want the screenshot
to be the only test.

if ernie needs another foundation after enough use, git will be available. it
has been extremely available so far.
