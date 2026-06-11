declare function print(value: unknown): void;

const arr: unknown[] = ["a", undefined, true];
const wrapper: { arr?: unknown } = {};
wrapper.arr = arr;
const boxed: any = wrapper.arr;

print(String(arr));
print(String(boxed));
