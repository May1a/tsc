declare function print(value: unknown): void;

const obj: { a?: unknown } = {};
obj.a = 1;
print(obj.isPrototypeOf(obj));
