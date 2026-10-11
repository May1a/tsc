declare function print(value: unknown): void;

const text = ' {"a":1}'.trim();
const value = JSON.parse(text);
print(value);
