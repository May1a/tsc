declare function print(value: unknown): void;

const g = function* (): Generator<number> { yield 1; };
print(g);
