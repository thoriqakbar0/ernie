# ADR 0002: Native Agent roots

Status: accepted, 2026-09-07. Supersedes the Agent/conversation ownership model in ADR 0001.

One Ernie Agent binds to one persisted Prime Agent root session. Prime Agent owns its name, configuration, transcript, execution, and descendants. Ernie owns presentation metadata. Sending continues the bound root; routine conversation creation and reassignment are removed from the product flow.

Binding uses the durable session ID and file, never the display name or active worker ID. Root preparation is durable before activation so retry and restart can reuse the same file. Missing roots remain unavailable; they are never silently recreated.

Legacy records with one associated root may bind directly. Records with several sessions require an explicit primary-root selection. All other sessions and immutable origins remain preserved and inspectable. Importing roots is explicit. Native children are identified from authoritative RLM metadata, never inferred from legacy associations.

Native instructions and working directory remain fixed once a root is prepared. Changing them requires a separately designed reset workflow. Model controls continue to use the native runtime. External native renames are reflected in Ernie.

Creation failure retains settings and the prepared identity for retry. Native name collisions are reported instead of silently producing numbered Agent identities. Child inspection uses native targets and does not create a new session or send a prompt.
