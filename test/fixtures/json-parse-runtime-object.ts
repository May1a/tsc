declare function print(value: unknown): void;

const text = '{"a":1,"b":true}';
const value = JSON.parse(text);
print(value.a);
print(value.b);
