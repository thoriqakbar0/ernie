export function createGreeting(name: string): string {
  return name.length === 0 ? "hello!" : `hello, ${name}!`
}
