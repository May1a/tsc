declare function print(value: unknown): void;

const wrapper: { value?: unknown } = {};
wrapper.value = true;
const value: any = wrapper.value;
const values: unknown[] = Object.values(value);
print(values.length);
