declare function print(value: unknown): void;

const obj: { value?: unknown } = {};
let enumerable = true;
Object.defineProperties(obj, {
  value: { value: "x", writable: true, enumerable, configurable: true }
});
const keys: unknown[] = Object.keys(obj);
print(keys.length);
print(keys[0]);
