declare function print(value: unknown): void;

const wrapper: { value?: unknown } = {};
wrapper.value = 1;
const value: any = wrapper.value;
const entries: unknown[] = Object.entries(value);
print(entries.length);
