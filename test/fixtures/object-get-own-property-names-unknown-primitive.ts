declare function print(value: unknown): void;

const wrapper: { value?: unknown } = {};
wrapper.value = 1;
const value: any = wrapper.value;
const names: unknown[] = Object.getOwnPropertyNames(value);
print(names.length);
