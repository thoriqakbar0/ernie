# Code style

## TSX file names

Use lowercase kebab-case for every `.tsx` file name.

```text
agent-card.tsx
attention-list.tsx
workspace-switcher.test.tsx
```

Do not use PascalCase, camelCase, underscores, or spaces in `.tsx` file names.

```text
AgentCard.tsx
agentCard.tsx
agent_card.tsx
agent card.tsx
```

Keep React component names in PascalCase inside the file. A file can export one primary component and its closely related types.

Use `index.ts` only as a deep-module entry point. Follow [src/packages/README.md](./src/packages/README.md) for package boundaries.
