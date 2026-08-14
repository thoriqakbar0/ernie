# I chose the smaller Ernie because I want to learn the harness

The decision began with a notification from Apple.

Nothing had broken. A workflow had submitted a desktop build for notarization,
Apple had processed it, and the system had reported what happened. The machine
was doing exactly what it had been designed to do.

I still did not want the notification.

I had asked an AI to help build Ernie. Somewhere along the way, "build itself"
had quietly expanded. It no longer meant changing the application and showing
me the result. It included packaging, nightly publishing, signing, deployment,
and the administrative residue of operating a software product.

The notification was small. The question behind it was not: what was I
actually trying to make?

## Two projects with one name

On August 14, 2026, I had two repositories called Ernie.

One was a fork of [bb](https://github.com/get-bb/bb), a large agent IDE that
already had the machinery expected of a serious product: a server, a host
daemon, a web app, a desktop app, plugins, deployment workflows, nightly
releases, signing, and Apple notarization.

The other was my earlier standalone desktop client for Prime Agent. It was much
smaller. It had fewer answers and more visible gaps.

At first, the larger project looked like the better place to learn. There was
more code to inspect and more infrastructure to operate. It was also an active
project, so I could inherit improvements from other contributors.

But operating a system is not the same as understanding it.

The Apple notification made the distinction visible. The repository carried
deployment paths, compatibility contracts, and release policy. These were good
systems, but they made me responsible for decisions I had not made. I was
learning how to keep somebody else's machine running.

So I reversed the relationship. I archived the bb-based fork as
[`ernie-bb-archive`](https://github.com/thoriqakbar0/ernie-bb-archive), restored
the standalone project as [`ernie`](https://github.com/thoriqakbar0/ernie), and
disabled automation on the archive.

After the rename, the working directory was quiet again. Not empty: the older
Ernie already contained an Electron shell, a Prime Agent client, a plugin host,
and a trail of unfinished questions. But they were questions I could reach
from where I stood.

This was not a rejection of large codebases. It was a decision about what I
wanted the codebase to teach me.

## The model is not the whole agent

A language model can produce text and request tools. It does not, by itself,
own a workspace, execute a command, remember a session, inspect a result, ask
for approval, or decide when work is complete.

The software around the model gives those actions their shape. That software is
commonly called the harness. A useful practical definition is everything that
turns a model invocation into situated, observable work: the agent loop, tool
contracts, context selection, memory, permissions, execution, verification,
and the interface through which a person can intervene.

The distinction matters because two products using the same model can behave
like different agents. The model supplies capability. The harness decides what
the capability can see, how it can act, and what evidence must exist before an
action counts as complete.

The [Hugging Face agent glossary](https://huggingface.co/blog/agent-glossary)
makes the boundary concrete: a model has no persistent loop or memory between
calls, while the surrounding scaffold and harness provide the behavior and
execution environment.

That boundary is exactly what I want to learn.

## DeepSeek made the harness a product

The official
[DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness) offers a
useful example. It does not present itself as another model. It is an
open-source system around models, and its architectural statement is unusually
direct: everything is a plugin.

That choice makes the harness visible as software. Tools, interfaces, and other
capabilities do not need to become permanent branches inside one central agent
loop. They can enter through explicit extension points, own their lifecycle,
and remain replaceable. DeepSeek currently labels the project a developer
preview and warns that compatibility-breaking changes will happen. For a
learner, that instability is not merely a risk. It exposes decisions that a
mature product may have already hidden.

The lesson is not that Ernie should copy DeepSeek Harness. Copying another
large architecture would recreate the problem I just left. The useful example
is the boundary it chooses to own. DeepSeek builds models, yet it treats the
harness as a separate engineering object worthy of its own repository,
architecture, plugins, documentation, and community.

Model work and harness work are related, but they teach different things.

Training a model teaches data, optimization, evaluation, and inference.
Building a harness teaches runtime state, context, tools, permissions,
feedback, interfaces, and failure recovery. I want the second education first.

## Why Ernie should remain small

Ernie is a desktop client for Prime Agent. Prime Agent owns execution,
sessions, descendants, and durable state. Ernie decides how a person encounters
that machinery.

This gives the project a useful constraint. I do not need to build a new model.
I do not need to reproduce every feature from bb, Claude Code, Codex, or
DeepSeek Harness. I can study one load-bearing seam at a time:

- how an agent session becomes durable;
- how tool activity becomes evidence instead of noise;
- how a desktop client reconnects to work that continued without it;
- how permissions remain explicit at the moment of action;
- how plugins acquire and release resources safely;
- how an interface shows uncertainty without turning the user into a full-time
  operator.

The current Ernie plugin host is deliberately incomplete. It supports trusted
built-in commands and primary views. It does not yet claim that arbitrary
third-party code can run safely. Signing, isolation, permissions, updates, and
removal remain real work.

That incompleteness is valuable because I can name it. A small project lets me
see the distance between a plugin-shaped API and a trustworthy plugin system.
In a larger fork, the same distance might be distributed across packages,
deployment policy, and compatibility layers I do not yet understand.

Small does not mean simplistic. It means the important boundaries remain close
enough to inspect.

## Build, observe, explain

I want Ernie to follow a learning loop rather than a release treadmill.

First, build the smallest behavior that crosses a real boundary. Connect to a
runtime. Execute one tool. Restore one session. Activate and disable one plugin.

Second, observe what actually happens. Keep the event, state transition, error,
and cleanup path visible. An agent that appears correct without evidence is not
a lesson yet.

Third, explain the mechanism in plain language. If I cannot explain who owns
the state, where input becomes trusted, why a failure is recoverable, and how I
verified the result, I have copied a shape without learning its structure.

Then repeat.

This also creates a limit on self-building. Ernie can help build Ernie, but
"the agent changed itself" is not the goal. The useful question is whether each
change produces evidence that I can inspect and knowledge that I can retain.
Self-modification without understanding would only automate confusion.

## A project I can finish repeatedly

I do not expect to finish an agent harness once.

Models will change. Tool protocols will change. Interfaces will change. My own
idea of useful agent work will change. A harness sits exactly where those
changes meet.

But I can finish one boundary at a time. I can make one interaction explicit,
one lifecycle reversible, and one failure observable. I can keep releases
manual until operating them becomes part of the lesson. I can borrow ideas from
bb and DeepSeek Harness without inheriting their entire operational surface.

That is why I chose the smaller Ernie.

I am not trying to own every layer of an agent product. I am trying to
understand the layer that turns model capability into work. Ernie is small
enough for me to argue with every decision, change it, watch the consequences,
and explain what I learned.

For now, that is the product.
