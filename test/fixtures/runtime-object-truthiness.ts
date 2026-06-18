declare function print(value: unknown): void;

const obj: { value?: unknown } = {};
if (obj) { print("object"); }
