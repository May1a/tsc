declare function print(value: unknown): void;

const obj: { value?: unknown } = {};
const base = { value: { value: "old", writable: true, enumerable: true, configurable: true } };
Object.defineProperties(obj, { ...base, value: { value: "new", writable: true, enumerable: true, configurable: true } });
print(obj.value);
