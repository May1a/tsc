declare function print(value: unknown): void;

const obj: { visible?: unknown; hidden?: unknown; removed?: unknown } = {};
Object.defineProperty(obj, "visible", { value: "v", writable: true, enumerable: true, configurable: true });
Object.defineProperty(obj, "hidden", { value: "h", writable: true, enumerable: false, configurable: true });
obj.removed = "x";
delete obj.removed;

const keys: unknown[] = Object.keys(obj);
const values: unknown[] = Object.values(obj);
const entries: unknown[] = Object.entries(obj);
print(keys.length);
print(values.length);
print(entries.length);
print(keys[0]);
print(values[0]);
