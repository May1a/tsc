declare function print(value: unknown): void;

function f(): () => Generator<number> { return function* () { yield 1; }; }
print(f());
