declare function print(value: unknown): void;
const value: number = 3;
let result = 0;
switch (value) {
  default:
    result = result + 1;
  case 4:
    result = result + 4;
    break;
}
print(result);
