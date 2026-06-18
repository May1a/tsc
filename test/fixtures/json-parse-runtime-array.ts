declare function print(value: unknown): void;

const text = '[1,"two",null]';
const value = JSON.parse(text);
print(value[0]);
print(value[1]);
print(value[2]);
