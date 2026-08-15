import { memo } from 'react';

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PrimeAgentThinkingLevel } from '@/packages/prime-agent-daemon/client';

interface EffortPickerProps {
  readonly busy: boolean;
  readonly levels: readonly PrimeAgentThinkingLevel[];
  readonly onLevelChange: (level: string | null) => void;
  readonly value: PrimeAgentThinkingLevel | null;
}

const effortLabels = {
  off: 'Off',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max',
} as const satisfies Readonly<Record<PrimeAgentThinkingLevel, string>>;

/** Select reasoning effort from the levels supported by the active model. */
export const EffortPicker = memo(function EffortPicker({
  busy,
  levels,
  onLevelChange,
  value,
}: EffortPickerProps): React.JSX.Element {
  return (
    <Select
      items={levels.map((level) => ({
        label: effortLabels[level],
        value: level,
      }))}
      value={value}
      onValueChange={onLevelChange}
    >
      <SelectTrigger
        size="sm"
        className="h-7 max-w-28 border-0 bg-transparent px-2 text-xs text-muted-foreground shadow-none"
        aria-label="Effort"
        disabled={busy || value === null || levels.length === 0}
      >
        <SelectValue placeholder="Effort unavailable" />
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}>
        <SelectGroup>
          {levels.map((level) => (
            <SelectItem key={level} value={level}>
              {effortLabels[level]}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
});
