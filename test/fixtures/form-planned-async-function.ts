declare function print(value: unknown): void;

async function f(): Promise<number> { return 1; }
print(f());
