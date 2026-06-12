declare function print(value: unknown): void;

const obj: { visible?: unknown; hidden?: unknown; removed?: unknown } = {};
Object.defineProperty(obj, "visible", { value: "v", writable: true, enumerable: true, configurable: true });
Object.defineProperty(obj, "hidden", { value: "h", writable: true, enumerable: false, configurable: true });
obj.removed = "x";
delete obj.removed;

const visible: boolean = Object.hasOwn(obj, "visible");
const hidden: boolean = Object.hasOwn(obj, "hidden");
const removed: boolean = Object.hasOwn(obj, "removed");
const missing: boolean = Object.hasOwn(obj, "missing");
const keys: unknown[] = Object.keys(obj);
const values: unknown[] = Object.values(obj);
const entries: unknown[] = Object.entries(obj);
print(visible);
print(hidden);
print(removed);
print(missing);
print(keys.length);
print(values.length);
print(entries.length);
