declare function print(value: unknown): void;

const obj: { value?: unknown } = {};
obj.value = null;
const arr: unknown[] = [null, undefined];

print(null);
print(obj.value);
print(obj.value === null);
print(arr[0] === null);
print(arr[1] === null);
print(undefined === null);
print(Object.hasOwn(obj, "value"));
