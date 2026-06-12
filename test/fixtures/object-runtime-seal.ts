declare function print(value: unknown): void;

const obj: { a?: unknown; b?: unknown } = { a: "x", b: "y" };
Object.seal(obj);
delete obj.a;
print(Object.isSealed(obj));
print(obj.a);
obj.b = "new";
print(obj.b);
print(Object.isExtensible(obj));
