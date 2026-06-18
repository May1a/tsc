declare function print(value: unknown): void;

const obj: { value?: unknown } = { value: "object" };
const wrapper: { obj?: unknown } = {};
wrapper.obj = obj;
const boxed: any = wrapper.obj;

const keys: unknown[] = Object.keys(boxed);
const values: unknown[] = Object.values(boxed);
print(keys.length);
print(values.length);
print(keys[0]);
print(values[0]);
