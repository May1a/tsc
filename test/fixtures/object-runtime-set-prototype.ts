declare function print(value: unknown): void;

const first: { value?: unknown; shadow?: unknown } = { value: "first", shadow: "first" };
const second: { value?: unknown; shadow?: unknown } = { value: "second", shadow: "second" };
const obj: { value?: unknown; shadow?: unknown; missing?: unknown } = Object.create(first);
obj.shadow = undefined;

print(obj.value);
print(obj.shadow);
Object.setPrototypeOf(obj, second);
print(obj.value);
print(obj.shadow);
Object.setPrototypeOf(obj, null);
print(obj.value);
print("value" in obj);
