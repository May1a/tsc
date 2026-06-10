declare function print(value: unknown): void;

const proto: { value?: unknown } = { value: "array-proto" };
const arr: unknown[] = [undefined];
arr.length = 0;
Object.setPrototypeOf(arr, proto);
const got: { value?: unknown } = Object.getPrototypeOf(arr);
print(got.value);
