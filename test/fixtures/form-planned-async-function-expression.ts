declare function print(value: unknown): void;

const f = async function (): Promise<number> { return 1; };
print(f());
