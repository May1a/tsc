declare function print(value: unknown): void;

function f(x: number): number { return x; }
print(f.apply(undefined, [1]));
