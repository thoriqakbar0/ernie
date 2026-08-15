# Ernie

Ernie provides an agent workspace and a stable automation boundary for recursive agent work.

## Language

**Agent harness**:
The stable automation interface through which agents start and observe RLM runs. It hides the underlying agent runtime.
_Avoid_: CLI, Prime Agent socket, UI control

**Agent run**:
One root task submitted through the Agent harness, including its recursive child work. It ends when the entire tree reaches terminal states.
_Avoid_: Command, invocation, task

**Agent session**:
Persistent agent context that can host multiple Agent runs. A new run creates one unless the caller explicitly selects an existing session.
_Avoid_: Run, process
