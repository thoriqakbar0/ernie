import { formatGreetingMessage } from './lib/impl';

/**
 * Formats the example package greeting through its public interface.
 *
 * @param name - The non-empty display name to greet.
 * @returns A stable greeting for the supplied name.
 */
export function formatGreeting(name: string): string {
  return formatGreetingMessage(name);
}
