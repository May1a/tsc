declare function print(value: unknown): void;
const value: number = 1;
let result = 0;
switch (value) {
  case 1:
  case 2:
    result = 2;
    break;
  default:
    result = 3;
}
print(result);
