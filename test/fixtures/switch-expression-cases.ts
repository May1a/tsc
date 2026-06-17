declare function print(value: unknown): void;
const base: number = 2;
const value: number = 3;
let result = 0;
switch (value) {
  case base + 1:
    result = 31;
    break;
  default:
    result = 40;
}
print(result);
