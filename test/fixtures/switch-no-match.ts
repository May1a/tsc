declare function print(value: unknown): void;
const value: number = 3;
let result = 7;
switch (value) {
  case 1:
    result = 10;
    break;
  case 2:
    result = 20;
    break;
}
print(result);
