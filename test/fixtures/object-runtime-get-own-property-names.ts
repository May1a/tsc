declare function print(value: unknown): void;

const obj: { a?: unknown; hidden?: unknown; b?: unknown } = {};
obj.a = "a";
Object.defineProperty(obj, "hidden", { value: "hidden", writable: true, enumerable: false, configurable: true });
obj.b = "b";
delete obj.a;
const names: unknown[] = Object.getOwnPropertyNames(obj);

print(names.length);
print(names[0]);
print(names[1]);
