declare function print(value: unknown): void;

function f(): () => Promise<number> { return async () => 1; }
print(f()());
