declare function print(value: unknown): void;

const arr: unknown[] = ["a", "b", "c"];
const wrapper: { arr?: unknown } = {};
wrapper.arr = arr;
const boxed: any = wrapper.arr;

const keys: unknown[] = Object.keys(boxed);
const values: unknown[] = Object.values(boxed);
print(keys.length);
print(values.length);
print(keys[0]);
print(keys[1]);
print(keys[2]);
print(values[0]);
print(values[1]);
print(values[2]);
