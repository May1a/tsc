declare function print(value: unknown): void;

const obj: { value?: unknown } = { value: "x" };
print(String(obj));
