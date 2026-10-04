declare function print(value: unknown): void;

const x = { a: 1 } satisfies { a: number };
print(x.a);
