declare function print(value: unknown): void;

function add(this: { base: number }, a: number, b: number): number {
  return this.base + a + b;
}

const ctx = { base: 10 };
print(add.call(ctx, 2, 3));
print(add.call({ base: 100 }, 5, 7));
