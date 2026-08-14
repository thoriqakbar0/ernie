# i wanted a cooler agent harness and accidentally built two (and forked one)

ernie began with a screenshot i wanted to exist.

i wanted a desktop app where agents could keep working after i closed the
window. their sessions would stay attached to repositories, their work would
branch, and the evidence would still be there when i came back. ideally, the
whole thing would look cool enough that i could point at it and say “agent
harness” without having to explain what i had been doing all week.

wanting to look cool is not the official reason people give for starting
software projects. it is, however, the reason i actually had.

there was another idea underneath it. tools do not remain passive for long.
people build a tool around one set of habits, then the tool makes those habits
easier, and eventually the surrounding environment assumes everyone has
adopted them.

cars are the obvious example. a car lets one person travel farther, but a city
full of cars needs roads, parking, traffic lights, petrol stations, wider
intersections, and buildings separated by car-sized distances. once that
environment exists, owning a car becomes less optional. the machine changed
the city, and the changed city made the machine necessary.

software works on a smaller scale, which makes it easier to miss. an unread
badge turns messages into obligations. infinite scroll removes the point where
you would have stopped. a chat box teaches you to type something, wait, and
read the reply.

i wondered what the usual chat box was teaching us about agents.

## the interface gave me a new job

a chat interface makes artificial intelligence easy to understand. there is a
conversation, the model answers, and the answer is the visible result. that
shape works well until the system can keep an objective, modify files, use
tools, spawn more work, and continue after the window disappears.

at that point, the transcript is only one view of what happened. the durable
object might be a repository change, a running process, or a task waiting for
approval. if the interface still puts the transcript at the center, the person
learns to watch the transcript.

my first ernie was an electron client for prime agent. prime agent already
owned durable sessions, workspaces, queued work, and child agents. ernie tried
to expose all of it.

i added a worktree workbench, project controls, session tabs, subagent trees,
tool output, and branch controls. each addition answered a real question. the
combined interface answered a different question: what if the user became air
traffic control?

i spent more time supervising the agent system i had built to reduce
supervision. this seemed inefficient, even by the generous standards of a
personal research project.

on august 10, i removed the interface. the first commit reported
[10,338 deletions](https://github.com/thoriqakbar0/ernie/commit/dabf6d974129ade57ee3633f266b562047d0c9ba).
two minutes later, the second reported
[12,824 deletions](https://github.com/thoriqakbar0/ernie/commit/63a757b7c2b93e32fe0342f4d65226772cb4399d).
git recorded 23,162 deleted lines across the two commits.

all 23,162 deletions established was that i had built enough interface to
require two trips to remove it. whether the replacement was better remained
unknown.

the smaller version drew a clearer boundary. prime agent would continue to own
execution and durable state. ernie would decide how a person encountered that
work. a conversation could live inside an agent without becoming the agent’s
identity, and evidence could remain available without covering the screen at
all times.

the result was calmer and easier for me to explain. i responded to this
progress by replacing it with a much larger repository.

## the repository already knew how to be a company

on august 13, i forked [bb](https://github.com/get-bb/bb). bb is an agent ide
with a server, a host daemon, web and desktop applications, plugins, deployment
workflows, nightly releases, signing, and apple notarization.

my ernie had open questions. bb had departments.

for a short time, the bb fork took the ernie name and the smaller app became
ernie legacy. this gave me a serious codebase with working answers to problems
i had not reached yet. it also gave me responsibility for those answers.

then apple sent me a notarization notification.

the workflow had submitted a desktop build, apple had processed it, and the
system had reported the result. nothing was broken. this was worse, because i
could not blame a bug. the repository was behaving correctly while i slowly
realized that “help me build this app” had expanded into nightly publishing,
release channels, signing, deployment, and the administrative life of a
software company.

i wanted to learn how an agent harness worked. i was learning how to operate
somebody else’s product.

so the names changed again. the bb fork became
[`ernie-bb-archive`](https://github.com/thoriqakbar0/ernie-bb-archive), and the
standalone app became [`ernie`](https://github.com/thoriqakbar0/ernie) again.

github records one literal fork here. i count the earlier rebuild and the later
repository reversal as two attempts to replace the foundation. github’s
version is better for network graphs. mine explains the week.

## i did want something from the larger harnesses

the fork was not wasted. it showed me which parts of a mature harness were
worth understanding separately from its product machinery.

a model can produce text and request tools, but it does not own a workspace,
retain a loop, reconnect after failure, ask for approval, or decide what
evidence makes a task complete. the harness supplies those rules. it determines
what the model can see, how actions run, where state survives, and when a person
has to intervene.

[bb’s agent runtime](https://github.com/get-bb/bb/tree/75c3ea0311601d8e41d6e523d8e4848526e272d5/packages/agent-runtime)
gave me a useful example of provider ownership. its shared runtime manages
lifecycle and routing, while each provider adapter handles the provider’s
protocol. a separate bridge process appears when a provider offers an sdk but
not a stable wire protocol. it is there to solve a specific transport problem,
not because every architecture diagram needs another box.

[deepseek harness](https://github.com/deepseek-ai/DeepSeek-Harness/tree/47f943859bef60e4160492346772ded9b24f765a)
made a different boundary visible. tools, interfaces, and capabilities enter
through plugins instead of accumulating as permanent branches in one central
loop. the project calls itself a developer preview and warns that compatibility
will break. that warning is inconvenient if you need a stable dependency. it
is useful if you are trying to see which decisions are still moving.

i did not need to become bb or deepseek harness. i needed to understand why
they put certain responsibilities on opposite sides of a boundary.

ernie now has a short path from the interface to prime agent:

```text
renderer -> electron ipc -> ernie daemon -> prime agent adapter -> daemon socket
```

the ernie daemon presents one application boundary to electron. the prime
agent adapter owns prime agent’s identity, protocol, connection, and failure
translation. because prime agent already provides a daemon socket, adding a
stdio bridge would only create another process for me to misunderstand.

## rebuilding may be the feature

the best interface for agents probably has not happened yet. current products
borrow familiar shapes from chat, editors, terminals, inboxes, and dashboards
because people already know how to use them. agents can behave differently from
all five, so some of those borrowed shapes will eventually look strange.

experimentation makes sense here, although i can use that uncertainty to
justify restarting forever.

a clean project feels clear because it has no accumulated compromises. it also
has no accumulated evidence. if i replace the interface as soon as it resists
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
it, and whether the work feels like mine. the difference is that i no longer
want a screenshot to be the only test.

if ernie needs another foundation after enough use, git will be available. it
has been extremely available so far.
