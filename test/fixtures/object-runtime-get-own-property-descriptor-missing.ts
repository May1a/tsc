declare function print(value: unknown): void;

const obj: { present?: unknown } = { present: "value" };
const missing = Object.getOwnPropertyDescriptor(obj, "missing");

print(missing === undefined);
