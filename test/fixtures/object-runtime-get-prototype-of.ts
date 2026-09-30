declare function print(value: unknown): void;

const proto: { a?: unknown } = {};
proto.a = "proto";
const obj: { b?: unknown } = {};
obj.b = "own";
Object.setPrototypeOf(obj, proto);
const found = Object.getPrototypeOf(obj) as { a?: unknown } | null;
print(found?.a);
print(obj.b);
