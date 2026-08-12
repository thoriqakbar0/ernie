import { create, insert, search } from 'zbsearch';
import type { ZBSearchPluginSync } from 'zbsearch';

/** One Prime Agent skill available to explicit composer search. */
export interface SkillSearchItem {
  readonly command: string;
  readonly description: string | null;
  readonly name: string;
}

/** A synchronous ranked search over one immutable skill catalog. */
export type SkillSearch = (
  query: string,
  limit: number,
) => readonly SkillSearchItem[];

/** A skill lookup explicitly activated from the task composer. */
export type SkillSearchQuery =
  | Readonly<{ kind: 'full-text'; term: string }>
  | Readonly<{ kind: 'single-vector'; term: string }>;

/** A ranked asynchronous search over one immutable skill catalog. */
export type AsyncSkillSearch = (
  query: string,
  limit: number,
) => Promise<readonly SkillSearchItem[]>;

/** Parse an isolated slash query or double-slash natural-language query. */
export function parseSkillQuery(draft: string): SkillSearchQuery | null {
  const singleVectorMatch = /^\/\/\s*(.*)$/u.exec(draft);
  if (singleVectorMatch !== null) {
    return {
      kind: 'single-vector',
      term: singleVectorMatch[1]?.trim() ?? '',
    };
  }

  const fullTextMatch = /^\/(?:skill:)?([^\s]*)$/u.exec(draft);
  return fullTextMatch === null
    ? null
    : {
        kind: 'full-text',
        term: fullTextMatch[1]?.toLocaleLowerCase() ?? '',
      };
}

/** Build an in-memory ZBSearch index and return its ranked query operation. */
export function createSkillSearch(
  skills: readonly SkillSearchItem[],
): SkillSearch {
  const database = create({
    schema: {
      command: 'string',
      description: 'string',
      name: 'string',
    },
  });
  const catalog: SkillSearchItem[] = [];
  const skillsByCommand = new Map<string, SkillSearchItem>();

  for (const skill of skills) {
    if (skillsByCommand.has(skill.command)) continue;
    const inserted = insert(database, {
      command: skill.command,
      description: skill.description ?? '',
      name: skill.name,
    });
    if (typeof inserted !== 'string') {
      throw new Error('The default ZBSearch index must insert synchronously.');
    }
    catalog.push(skill);
    skillsByCommand.set(skill.command, skill);
  }

  return (query, limit) => {
    if (!Number.isSafeInteger(limit) || limit <= 0) return [];
    const term = query.trim();
    if (term.length === 0) return catalog.slice(0, limit);

    const result = search(database, {
      boost: {
        command: 2,
        description: 1,
        name: 3,
      },
      limit,
      properties: ['name', 'command', 'description'],
      term,
      tolerance: term.length >= 4 ? 1 : 0,
    });
    if (result instanceof Promise) {
      throw new Error('The default ZBSearch index must search synchronously.');
    }

    return result.hits.flatMap((hit) => {
      const skill = skillsByCommand.get(hit.document.command);
      return skill === undefined ? [] : [skill];
    });
  };
}

/** Build one lazy, local embedding index for natural-language skill lookup. */
export async function createSingleVectorSkillSearch(
  skills: readonly SkillSearchItem[],
): Promise<AsyncSkillSearch> {
  const catalog: SkillSearchItem[] = [];
  const skillsByCommand = new Map<string, SkillSearchItem>();
  for (const skill of skills) {
    if (skillsByCommand.has(skill.command)) continue;
    catalog.push(skill);
    skillsByCommand.set(skill.command, skill);
  }
  if (catalog.length === 0) return async () => [];

  await import('@tensorflow/tfjs-backend-cpu');
  const tensorflow = await import('@tensorflow/tfjs-core');
  await tensorflow.setBackend('cpu');
  await tensorflow.ready();

  const { embeddingsType, pluginEmbeddings } = await import(
    '@zbsearch/plugin-embeddings'
  );
  const embeddings = await pluginEmbeddings({
    embeddings: {
      defaultProperty: 'embedding',
      onInsert: {
        generate: true,
        properties: ['name', 'command', 'description'],
      },
    },
  });
  // SAFETY: both packages are pinned to ZBSearch 3.3.4; only their dual ESM/CJS
  // declaration identities differ, while the runtime plugin contract is shared.
  const typedEmbeddings = embeddings as unknown as ZBSearchPluginSync;
  const beforeInsert = typedEmbeddings.beforeInsert;
  const beforeSearch = typedEmbeddings.beforeSearch;
  const compatibleEmbeddings = {
    name: typedEmbeddings.name,
    ...(beforeInsert === undefined
      ? {}
      : {
          beforeInsert: async (...args: Parameters<typeof beforeInsert>) => {
            await beforeInsert(...args);
          },
        }),
    ...(beforeSearch === undefined
      ? {}
      : {
          beforeSearch: async (...args: Parameters<typeof beforeSearch>) => {
            await beforeSearch(...args);
          },
        }),
  } as unknown as ZBSearchPluginSync;
  const database = await create({
    plugins: [compatibleEmbeddings],
    schema: {
      command: 'string',
      description: 'string',
      embedding: embeddingsType,
      name: 'string',
    },
  });

  for (const skill of catalog) {
    await insert(database, {
      command: skill.command,
      description: skill.description ?? '',
      name: skill.name,
    });
  }

  return async (query, limit) => {
    if (!Number.isSafeInteger(limit) || limit <= 0) return [];
    const term = query.trim();
    if (term.length === 0) return catalog.slice(0, limit);

    const result = await search(database, {
      boost: {
        command: 2,
        description: 1,
        name: 3,
      },
      hybridWeights: {
        text: 0.55,
        vector: 0.45,
      },
      limit,
      mode: 'hybrid',
      properties: ['name', 'command', 'description'],
      similarity: 0,
      term,
    });
    return result.hits.flatMap((hit) => {
      const skill = skillsByCommand.get(hit.document.command);
      return skill === undefined ? [] : [skill];
    });
  };
}
