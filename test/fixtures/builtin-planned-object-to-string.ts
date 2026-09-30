declare function print(value: unknown): void;

const obj: { a?: unknown } = {};
obj.a = "one";
print(obj.toString());
