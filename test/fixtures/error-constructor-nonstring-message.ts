declare function print(value: unknown): void;

const a = new Error(42 as unknown as string);
print(a.message);

const b = new Error(null as unknown as string);
print(b.message);

const c = new Error(true as unknown as string);
print(c.message);
