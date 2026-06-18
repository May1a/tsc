declare function print(value: unknown): void;
const value: number = 3;
let result = 0;
switch (value) {
  case 1:
    result = 10;
    break;
  default:
    result = 30;
}
print(result);
