declare function print(value: unknown): void;
const value: number = 1;
let result = 0;
switch (value) {
  case 1:
    result = result + 1;
  case 2:
    result = result + 2;
    break;
  default:
    result = result + 10;
}
print(result);
