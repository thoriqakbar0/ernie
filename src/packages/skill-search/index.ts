import { create, insert, search } from 'zbsearch';

/** One Prime Agent skill available to slash-command search. */
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

/** Parse a draft only when its complete content is one slash skill query. */
export function parseSkillQuery(draft: string): string | null {
  const match = /^\/(?:skill:)?([^\s]*)$/u.exec(draft);
  return match?.[1]?.toLocaleLowerCase() ?? null;
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
