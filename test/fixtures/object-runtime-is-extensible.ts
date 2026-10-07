declare function print(value: unknown): void;

const obj: { a?: unknown } = {};
obj.a = "one";
print(Object.isExtensible(obj));
Object.preventExtensions(obj);
print(Object.isExtensible(obj));
