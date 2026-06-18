declare function print(value: unknown): void;

const obj: { x?: unknown } = {};
const writable = false;
let enumerable = true;
const configurable = false;

Object.defineProperties(obj, {
  x: { value: 1, writable, enumerable, configurable }
});
obj.x = 2;
const keys: unknown[] = Object.keys(obj);
const desc: any = Object.getOwnPropertyDescriptor(obj, "x");

print(obj.x);
print(keys.length);
print(desc.writable);
print(desc.enumerable);
print(desc.configurable);
