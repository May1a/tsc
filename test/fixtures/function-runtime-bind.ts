declare function print(value: unknown): void;

function combine(this: { prefix: string }, a: string, b: string): string {
  return this.prefix + ":" + a + ":" + b;
}

const bound1 = combine.bind({ prefix: "p" }, "x");
print(bound1("y"));
print(bound1.name);
print(bound1.length);

const bound2 = bound1.bind({ prefix: "ignored" }, "z");
print(bound2());
print(bound2.length);
