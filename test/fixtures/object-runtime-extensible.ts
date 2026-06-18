declare function print(value: unknown): void;

const obj: { existing?: unknown; added?: unknown; defined?: unknown } = {};
obj.existing = "old";
print(Object.isExtensible(obj));
Object.preventExtensions(obj);
obj.existing = "new";
obj.added = "nope";
Object.defineProperty(obj, "defined", { value: "nope", writable: true, enumerable: true, configurable: true });

print(Object.isExtensible(obj));
print(obj.existing);
print(obj.added);
print(obj.defined);
