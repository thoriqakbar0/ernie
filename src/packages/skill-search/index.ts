import { create, insert, search } from 'zbsearch';
import { Predicate } from 'effect';

/** One Prime Agent skill available to explicit composer search. */
export interface SkillSearchItem {
  readonly command: string;
  readonly content: string;
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
  | Readonly<{ kind: 'full-text'; start: number; term: string }>
  | Readonly<{ kind: 'deep-full-text'; start: number; term: string }>;

/** Parse the active slash query after zero or more completed skill commands. */
export function parseSkillQuery(draft: string): SkillSearchQuery | null {
  const deepFullTextMatch = /^((?:\/skill:[^\s]+\s+)*)(\/\/\s*(.*))$/u.exec(
    draft,
  );
  if (deepFullTextMatch !== null) {
    return {
      kind: 'deep-full-text',
      start: deepFullTextMatch[1]?.length ?? 0,
      term: deepFullTextMatch[3]?.trim() ?? '',
    };
  }

  const fullTextMatch = /^((?:\/skill:[^\s]+\s+)*)(\/(?:skill:)?([^\s]*))$/u.exec(
    draft,
  );
  return fullTextMatch === null
    ? null
    : {
        kind: 'full-text',
        start: fullTextMatch[1]?.length ?? 0,
        term: fullTextMatch[3]?.toLocaleLowerCase() ?? '',
      };
}

/** Replace only the active skill query while preserving prior skill commands. */
export function replaceSkillQuery(
  draft: string,
  query: SkillSearchQuery,
  command: string,
): string {
  return `${draft.slice(0, query.start)}${command} `;
}

/** Build an in-memory ZBSearch index and return its ranked query operation. */
export function createSkillSearch(
  skills: readonly SkillSearchItem[],
): SkillSearch {
  const database = create({
    schema: {
      command: 'string',
      content: 'string',
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
      content: skill.content,
      description: skill.description ?? '',
      name: skill.name,
    });
    if (!Predicate.isString(inserted)) {
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
        command: 3,
        content: 1,
        description: 2,
        name: 4,
      },
      limit,
      properties: ['name', 'command', 'description', 'content'],
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
