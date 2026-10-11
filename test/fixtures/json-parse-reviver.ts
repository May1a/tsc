declare function print(value: unknown): void;

const text = '{"a":1}';
const value = JSON.parse(text, (_key, item) => item);
print(value.a);
