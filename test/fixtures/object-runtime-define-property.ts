declare function print(value: unknown): void;

const obj: { locked?: unknown; configurable?: unknown; normal?: unknown } = {};
Object.defineProperty(obj, "locked", { value: "fixed", writable: false, enumerable: true, configurable: false });
Object.defineProperty(obj, "configurable", { value: "old", writable: true, enumerable: true, configurable: true });
obj.locked = "changed";
obj.configurable = "changed";
delete obj.locked;
delete obj.configurable;
obj.normal = "normal";

print(obj.locked);
print(obj.configurable);
print(obj.normal);
