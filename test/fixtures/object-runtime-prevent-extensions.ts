declare function print(value: unknown): void;

const obj: { existing?: unknown; added?: unknown } = {};
obj.existing = "old";
print(Object.isExtensible(obj));
Object.preventExtensions(obj);
obj.existing = "new";
obj.added = "nope";
print(Object.isExtensible(obj));
print(obj.existing);
print(obj.added);
