declare function print(value: unknown): void;

function* g(): Generator<number> { yield 1; }
print(g);
