declare function print(value: unknown): void;

const obj: { value?: unknown } = {};
const value = { value: "x", writable: false, enumerable: true, configurable: false };
Object.defineProperties(obj, { value });
obj.value = "changed";
delete obj.value;
print(obj.value);
const keys: unknown[] = Object.keys(obj);
print(keys.length);
