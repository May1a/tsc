declare function print(value: unknown): void;

const grandparent: { a?: number } = {};
grandparent.a = 1;
const parent = Object.create(grandparent);
const child = Object.create(parent);
const unrelated: { b?: number } = {};
unrelated.b = 2;

print(grandparent.isPrototypeOf(parent));
print(grandparent.isPrototypeOf(child));
print(parent.isPrototypeOf(child));
print(child.isPrototypeOf(parent));
print(unrelated.isPrototypeOf(child));
print(parent.isPrototypeOf(parent));
print(parent.isPrototypeOf(42 as unknown as object));
print(parent.isPrototypeOf(null as unknown as object));

const proto = Object.getPrototypeOf(grandparent);
print(proto.isPrototypeOf(grandparent));
print(proto.isPrototypeOf(child));
const nullProto = Object.create(null);
print(proto.isPrototypeOf(nullProto));
