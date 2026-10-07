declare function print(value: unknown): void;

const obj: { a?: unknown } = {};
obj.a = "one";
print(Object.isFrozen(obj));
Object.freeze(obj);
print(Object.isFrozen(obj));
