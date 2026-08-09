import type { AgentSlashCommand } from "../../shared/commands";

const SOURCE_LABEL = {
  extension: "Extension",
  prompt: "Prompt",
  skill: "Skill",
} as const;

/** Returns the bounded command suggestions for a slash-prefixed composer token. */
export function matchingCommands(commands: readonly AgentSlashCommand[], draft: string): readonly AgentSlashCommand[] {
  if (!draft.startsWith("/") || /\s/.test(draft)) return [];
  const query = draft.slice(1).toLocaleLowerCase();
  return commands
    .filter((command) => command.name.toLocaleLowerCase().includes(query) || command.description?.toLocaleLowerCase().includes(query))
    .sort((left, right) => {
      const leftStarts = left.name.toLocaleLowerCase().startsWith(query);
      const rightStarts = right.name.toLocaleLowerCase().startsWith(query);
      if (leftStarts !== rightStarts) return leftStarts ? -1 : 1;
      return left.name.localeCompare(right.name);
    })
    .slice(0, 7);
}

interface ComposerAutocompleteProps {
  readonly commands: readonly AgentSlashCommand[];
  readonly activeIndex: number;
  readonly onActiveIndexChange: (index: number) => void;
  readonly onChoose: (command: AgentSlashCommand) => void;
}

/** Accessible slash-command menu positioned above the composer. */
export function ComposerAutocomplete({ commands, activeIndex, onActiveIndexChange, onChoose }: ComposerAutocompleteProps) {
  if (commands.length === 0) return null;

  return <div id="prime-command-menu" className="command-menu" role="listbox" aria-label="Prime Agent commands and skills">
    <div className="command-menu-heading"><span>Commands &amp; skills</span><kbd>↑↓</kbd><span>navigate</span><kbd>↵</kbd><span>insert</span></div>
    <div className="command-menu-options">
      {commands.map((command, index) => <button
        key={`${command.source}:${command.name}`}
        id={`command-option-${index}`}
        type="button"
        role="option"
        tabIndex={-1}
        aria-selected={index === activeIndex}
        className={index === activeIndex ? "active" : ""}
        onMouseEnter={() => onActiveIndexChange(index)}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onChoose(command)}
      >
        <span className="command-slash" aria-hidden="true">/</span>
        <span className="command-copy"><strong>{command.name}</strong><small>{command.description ?? "Prime Agent command"}</small></span>
        <span className={`command-source ${command.source}`}>{SOURCE_LABEL[command.source]}</span>
      </button>)}
    </div>
  </div>;
}
