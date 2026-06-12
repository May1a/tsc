declare function print(value: unknown): void;

const obj: { x?: unknown; y?: unknown } = { x: "a", y: "b" };
Object.freeze(obj);
print(Object.isFrozen(obj));
print(Object.isSealed(obj));
print(Object.isExtensible(obj));

const obj2: { x?: unknown; y?: unknown } = { x: "a", y: "b" };
Object.seal(obj2);
print(Object.isFrozen(obj2));
print(Object.isSealed(obj2));
print(Object.isExtensible(obj2));

const obj3: { x?: unknown } = { x: "a" };
print(Object.isFrozen(obj3));
print(Object.isSealed(obj3));
print(Object.isExtensible(obj3));
