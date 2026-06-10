declare function print(value: unknown): void;

const obj: { a?: unknown; hidden?: unknown; locked?: unknown } = {};
Object.defineProperties(obj, {
  a: { value: "a", writable: true, enumerable: true, configurable: true },
  hidden: { value: "hidden", writable: true, enumerable: false, configurable: true },
  locked: { value: "locked", writable: false, enumerable: true, configurable: false }
});

obj.locked = "changed";
const keys: unknown[] = Object.keys(obj);
print(obj.a);
print(obj.hidden);
print(obj.locked);
print(keys.length);
print(keys[0]);
print(keys[1]);
