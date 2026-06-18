declare function print(value: unknown): void;

const wrapper: { value?: unknown } = {};
wrapper.value = 1;
const value: any = wrapper.value;
const descriptors = Object.getOwnPropertyDescriptors(value);
const keys: unknown[] = Object.keys(descriptors);
print(keys.length);
