declare function print(value: unknown): void;

const obj: { a?: unknown; hidden?: unknown } = {};
obj.a = "a";
Object.defineProperty(obj, "hidden", { value: "hidden", writable: false, enumerable: false, configurable: true });
const descriptors: any = Object.getOwnPropertyDescriptors(obj);
const a: any = descriptors.a;
const hidden: any = descriptors.hidden;
const keys: unknown[] = Object.keys(descriptors);

print(a.value);
print(a.enumerable);
print(hidden.value);
print(hidden.writable);
print(keys.length);
