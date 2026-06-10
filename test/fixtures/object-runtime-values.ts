declare function print(value: unknown): void;

const proto: { inherited?: unknown } = { inherited: "no" };
const obj: { a?: unknown; b?: unknown; hidden?: unknown; removed?: unknown; inherited?: unknown } = Object.create(proto);
obj.a = "a";
obj.removed = "gone";
Object.defineProperty(obj, "hidden", { value: "hidden", writable: true, enumerable: false, configurable: true });
delete obj.removed;
obj.b = undefined;

const values: unknown[] = Object.values(obj);
print(values.length);
print(values[0]);
print(values[1]);
print(values[2]);
