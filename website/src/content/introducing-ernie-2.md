When [Prime Agent](https://github.com/PrimeIntellect-ai/prime-agent) and [DeepSeek Harness](https://www.deepseek.com/harness/en/) came out, I kept thinking about the interface. I want the agent to redesign the app while I’m using it. It can start with what I’m working on and propose an interface that would help.

That’s what I’m exploring with Ernie, a desktop app built on Prime Agent. **Tell the agent what you’re trying to do. Let it propose the screen you need.**

My mom teaches and is working on her PhD. She should be able to say she’s preparing a lesson while working through her research. The agent could put together a weekly plan with reading notes and writing time. She wouldn’t need to name the panels or design the layout first.

When I’m working on a feature, the agent could put the implementation plan beside the files I’m changing. Once I start reviewing, it could suggest a view of the changes and failing checks. Choosing what to show would become part of helping me with the work.

These are the interactions I want to build. The demos above let you try a few arrangements; they don’t yet generate an interface from your task.

## We’re micromanaging the agents

If I have to find every file and explain the next step, the agent has successfully delegated the investigation to me. I want to give it a goal and let it work out what to read and try next.

[The Mismanaged Geniuses Hypothesis](https://alexzhang13.github.io/blog/2026/mgh/) gives me a reason to take that seriously. Alex Zhang and his coauthors argue that our ways of organizing model calls may underuse the models’ capabilities. Better ways to divide and combine work could help them solve tasks they struggle with today.

I think of a harness, the software that runs the agent, as a translation layer. The hypothesis is that it could turn an unfamiliar task into smaller problems within the model’s existing capabilities. Finding that decomposition is part of the work. I’d like the agent to have more control over it.

## Let them work

[Recursive Language Models](https://arxiv.org/abs/2512.24601), or RLMs, let a model write code to examine input and delegate questions to further model calls. A persistent programming environment stores the input and intermediate results. The model can search, split, and revisit that material as it works.

Consider a bug that spans several modules. The agent can find an entry point, investigate the relevant files through separate calls, and collect their findings. It can then follow a dependency those investigations uncovered. Each call sees a focused part of the problem; the program coordinates the investigation.

**The agent gets to choose what it needs to read next.** That’s the part I care about. I shouldn’t need to predict every piece of context before it starts.

Each call still has a context limit, and the agent can choose the wrong approach. The harness changes how the model uses its existing capabilities during inference; it doesn’t update the model’s weights. The appeal is being able to investigate a problem that won’t fit into one call.

Prime Agent describes itself as an RLM agent. Ernie gives me a desktop interface for working with that runtime.

## The interface is still getting in the way

The agent can finish its investigation and leave me starting mine: finding the answer in the chat. Comparing its findings means scrolling between messages, with the plan further up and the sources somewhere else.

I want the agent to choose an interface that helps me use what it found. It already has context about the task. It should be able to propose what belongs together on the screen, then build that view.

For a literature review, that might be a comparison of papers with their methods and open questions. For lesson preparation, it might be a sequence of activities I can rearrange. The agent should be able to suggest those forms without making me describe every component.

**Choosing the interface is part of the agent’s job. Deciding whether it helps is part of mine.** I can try its suggestion and say, “I need the sources beside this,” or “give me more room to write.” That feedback gives it something concrete to improve.

This is what I mean by not micromanaging the agent, but micromanaging how I interact with it. I don’t want to prescribe each step or draw every screen. I want to be particular about the result: whether I can compare the evidence, change the plan, or understand what needs my attention.

The interface should develop with the work. An agent might suggest replacing a planning view with a review view when there’s a draft to inspect. I should be able to keep the current arrangement, accept the suggestion, or ask for something else.

## My problem with DeepSeek Harness

[DeepSeek Harness](https://www.deepseek.com/harness/en/) makes almost everything a plugin, including the execution loop and the interface. Looking at its [architecture](https://github.com/deepseek-ai/deepseek-harness), my first instinct is apparently to become the agent’s middle manager. I could spend the afternoon deciding how it should spend the afternoon.

That’s my concern about how I’d use this flexibility, rather than something plugins force me to do. Memory systems and tool connections through the Model Context Protocol (MCP) don’t decide who directs the work. [Prime Agent also keeps memory and harness state](https://github.com/PrimeIntellect-ai/prime-agent#prime-agent-a-self-improving-rlm-harness), with a refinement mechanism the agent can use. I want it making more of those decisions. I wanted help with my work. Supervising its reading habits sounds like additional work.

The screen, though, I have complaints about. If I’m comparing papers, put them next to each other. If the agent thinks a table would help, let it make one. I can use it and discover that I wanted the sources beside it. This is a decision I’m qualified to make because I am the person squinting at the table.

That’s what I want to try with Ernie and Prime Agent. Let the agent work out how to investigate, and let it build me an interface for the results. I’ll have opinions once there’s something to use.

## Zenbu.js gives the agent a layer to shape

[Zenbu.js](https://github.com/zenbu-labs/zenbu.js) felt like the right fit for this. Zenbu supports plugins that extend application behavior without editing the app’s original source. Those plugins can hot reload, which gives me a mechanism for trying interface changes as an agent develops them.

That’s the interaction I want: **keep working while the agent builds and revises the interface around the task.** I could be reading research notes while it adds a comparison view. Once I try that view, I can ask it to keep the sources visible or give my notes more room. Using the interface becomes part of developing it.

The flow I’m building is to ask Prime Agent through Ernie’s UI, then have it adapt the interface through Zenbu plugins. I describe what I’m doing, try the view it creates, and ask for changes from there. The framework supports the extension mechanism; that complete interaction still needs end-to-end validation in Ernie.

[Zenbu](https://github.com/zenbu-labs/zenbu.js) makes the interface something we can keep changing as we use it. I can try a view, notice what’s missing, and ask the agent to adjust it. I don’t have to know exactly what I need before I start.

I want it to rearrange the screen while I work. My notes need to survive its interior-design phase. I need to see what changed, undo an edit, and close a panel without losing what I wrote.

In [The best software is yet to be made](https://ta-0.com/blog/the-best-software-is-yet-to-be-made), I wrote about software that could adapt to the work. Ernie is where I’m trying to make that happen. I want to bring a task, let the agent propose a way to work on it, and shape that interface together by using it.
