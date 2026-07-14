declare function print(value: unknown): void;

function makeGreeting(prefix: string) {
  return (name: string): string => prefix + name;
}

const greet = makeGreeting("hello ");
print(greet("Ada"));
