declare function print(value: unknown): void;
let value = 1;
const result = value++ + ++value;
print(result);
print(value);
