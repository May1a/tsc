declare function print(value: unknown): void;

const base: Record<string, unknown> = { visible: "yes" };
Object.defineProperty(base, "hidden", { value: "secret", enumerable: false, writable: true, configurable: true });
const obj = { ...base };
const keys: unknown[] = Object.keys(obj);
print(keys.length);
print(obj.visible);
print(obj.hidden);
