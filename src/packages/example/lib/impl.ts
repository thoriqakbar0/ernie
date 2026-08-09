/**
 * Implements the example greeting behind the package interface.
 *
 * @param name - The display name to include in the greeting.
 * @returns The formatted greeting.
 */
export function formatGreetingMessage(name: string): string {
  const normalizedName = name.trim();

  if (normalizedName.length === 0) {
    throw new Error('The greeting name must not be empty.');
  }

  return `Hello, ${normalizedName}.`;
}
