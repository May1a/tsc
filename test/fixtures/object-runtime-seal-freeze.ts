declare function print(value: unknown): void;

const obj: { mutable?: unknown; remove?: unknown; added?: unknown } = { mutable: "old", remove: "keep" };
Object.seal(obj);
obj.mutable = "new";
obj.added = "nope";
delete obj.remove;
print(Object.isSealed(obj));
print(obj.mutable);
print(obj.remove);
print(obj.added);

Object.freeze(obj);
obj.mutable = "frozen";
print(Object.isFrozen(obj));
print(obj.mutable);
