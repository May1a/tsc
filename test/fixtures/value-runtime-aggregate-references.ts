declare function print(value: unknown): void;

const obj: { value?: unknown } = { value: "object" };
const arr: unknown[] = [obj];
const wrapper: { child?: unknown } = {};
wrapper.child = arr;

print(arr[0] === obj);
print(wrapper.child === arr);
print(Object.hasOwn(wrapper, "child"));
print(obj);
print(arr);
