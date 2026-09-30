declare function print(value: unknown): void;

const obj: { a?: unknown } = {};
obj.a = "one";
print(Object.isSealed(obj));
Object.seal(obj);
print(Object.isSealed(obj));
print(Object.isFrozen(obj));
