declare function print(value: unknown): void;

const base: Record<string, unknown> = { a: "old" };
const obj = { ...base, a: "new" };
print(obj.a);
